import pool from "../config/database.js";

function notFound() {
  const error = new Error("Product not found.");
  error.status = 404;
  error.publicMessage = "We couldn't find this product.";
  return error;
}

function duplicateSku() {
  const error = new Error("Duplicate product SKU.");
  error.status = 409;
  error.publicMessage = "A product with this SKU already exists.";
  return error;
}

function mapDatabaseError(error) {
  if (error.code === "23505" &&
      error.constraint === "products_business_sku_unique") {
    return duplicateSku();
  }
  return error;
}

const productColumns = `
  id, business_id, name, sku, description,
  stock_quantity, is_active, created_at, updated_at
`;

export async function createProduct(businessId, data) {
  try {
    const result = await pool.query(
      `INSERT INTO products
         (business_id, name, sku, description, stock_quantity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${productColumns}`,
      [
        businessId,
        data.name,
        data.sku ?? null,
        data.description ?? null,
        data.stockQuantity ?? 0,
      ],
    );

    return result.rows[0];
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function listProducts(businessId, includeArchived = false) {
  const result = await pool.query(
    `SELECT ${productColumns}
     FROM products
     WHERE business_id = $1
       AND ($2::BOOLEAN = TRUE OR is_active = TRUE)
     ORDER BY created_at DESC, id DESC`,
    [businessId, includeArchived],
  );

  return result.rows;
}

export async function getProduct(businessId, productId) {
  const result = await pool.query(
    `SELECT ${productColumns}
     FROM products
     WHERE business_id = $1
       AND id = $2
       AND is_active = TRUE`,
    [businessId, productId],
  );

  if (!result.rows[0]) throw notFound();
  return result.rows[0];
}

export async function updateProduct(businessId, productId, data) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `SELECT ${productColumns}
       FROM products
       WHERE business_id = $1
         AND id = $2
         AND is_active = TRUE
       FOR UPDATE`,
      [businessId, productId],
    );

    const current = currentResult.rows[0];
    if (!current) throw notFound();

    const columnMap = {
      name: "name",
      sku: "sku",
      description: "description",
      stockQuantity: "stock_quantity",
    };

    const assignments = [];
    const values = [businessId, productId];

    for (const [key, column] of Object.entries(columnMap)) {
      if (Object.hasOwn(data, key)) {
        values.push(data[key]);
        assignments.push(`${column} = $${values.length}`);
      }
    }

    assignments.push("updated_at = NOW()");

    const updatedResult = await client.query(
      `UPDATE products
       SET ${assignments.join(", ")}
       WHERE business_id = $1 AND id = $2
       RETURNING ${productColumns}`,
      values,
    );

    const product = updatedResult.rows[0];
    let restockCampaign = null;

    const previousQuantity = Number(current.stock_quantity);
    const newQuantity = Number(product.stock_quantity);
    const addedQuantity = newQuantity - previousQuantity;

    // Only a genuine increase in inventory creates a restock event.
    if (addedQuantity > 0) {
      const eventResult = await client.query(
        `INSERT INTO restock_events (
           business_id,
           product_id,
           previous_quantity,
           added_quantity,
           available_quantity
         )
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, business_id, product_id,
                   previous_quantity, added_quantity,
                   available_quantity, created_at`,
        [
          businessId,
          productId,
          previousQuantity,
          addedQuantity,
          newQuantity,
        ],
      );

      const event = eventResult.rows[0];

      const campaignResult = await client.query(
        `INSERT INTO restock_campaigns (
           business_id,
           product_id,
           restock_event_id,
           status,
           selection_mode,
           batch_size,
           stock_limit
         )
         VALUES ($1, $2, $3, 'queued', 'fifo', 100, $4)
         RETURNING id, business_id, product_id,
                   restock_event_id, status, selection_mode,
                   batch_size, stock_limit, created_at`,
        [businessId, productId, event.id, addedQuantity],
      );

      restockCampaign = campaignResult.rows[0];
    }

    await client.query("COMMIT");

    return { product, restockCampaign };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw mapDatabaseError(error);
  } finally {
    client.release();
  }
}

export async function archiveProduct(businessId, productId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE products
       SET is_active = FALSE, updated_at = NOW()
       WHERE business_id = $1
         AND id = $2
         AND is_active = TRUE
       RETURNING ${productColumns}`,
      [businessId, productId],
    );

    const product = result.rows[0];
    if (!product) throw notFound();

    // Stop campaigns that have not finished.
    await client.query(
      `UPDATE restock_campaigns
       SET status = 'cancelled',
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW()
       WHERE business_id = $1
         AND product_id = $2
         AND status IN ('draft', 'queued', 'processing', 'paused')`,
      [businessId, productId],
    );

    await client.query(
      `UPDATE follow_up_messages m
       SET status = 'cancelled',
           last_error = 'Restock campaign cancelled because its product was archived.',
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW()
       WHERE m.business_id = $1
         AND m.source_type = 'restock'
         AND m.status = 'pending'
         AND EXISTS (
           SELECT 1
           FROM restock_campaign_recipients r
           INNER JOIN restock_campaigns c
             ON c.business_id = r.business_id
            AND c.id = r.campaign_id
           WHERE r.business_id = m.business_id
             AND r.id = m.restock_recipient_id
             AND c.product_id = $2
         )`,
      [businessId, productId],
    );

    await client.query(
      `UPDATE restock_campaign_recipients r
       SET status = 'cancelled',
           updated_at = NOW()
       FROM restock_campaigns c
       WHERE c.business_id = r.business_id
         AND c.id = r.campaign_id
         AND r.business_id = $1
         AND c.product_id = $2
         AND r.status = 'queued'`,
      [businessId, productId],
    );

    await client.query("COMMIT");
    return product;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
