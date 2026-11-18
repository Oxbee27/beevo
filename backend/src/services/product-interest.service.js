import pool from "../config/database.js";

function serviceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function createProductInterest(businessId, productId, data) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const product = await client.query(
      `SELECT id
       FROM products
       WHERE business_id = $1
         AND id = $2
         AND is_active = TRUE
       FOR UPDATE`,
      [businessId, productId]
    );

    if (!product.rowCount) {
      throw serviceError("This product could not be found or is unavailable.", 404);
    }

    const customer = await client.query(
      `SELECT id
       FROM customers
       WHERE business_id = $1
         AND id = $2`,
      [businessId, data.customerId]
    );

    if (!customer.rowCount) {
      throw serviceError("The selected customer could not be found.", 404);
    }

    if (data.enquiryId) {
      const enquiry = await client.query(
        `SELECT id
         FROM enquiries
         WHERE business_id = $1
           AND id = $2
           AND customer_id = $3`,
        [businessId, data.enquiryId, data.customerId]
      );

      if (!enquiry.rowCount) {
        throw serviceError(
          "The selected enquiry does not belong to this customer.",
          400
        );
      }
    }

    const existing = await client.query(
      `SELECT id
       FROM product_interests
       WHERE business_id = $1
         AND product_id = $2
         AND customer_id = $3
         AND status = 'waiting'
       LIMIT 1`,
      [businessId, productId, data.customerId]
    );

    if (existing.rowCount) {
      throw serviceError(
        "This customer is already on the waiting list for this product.",
        409
      );
    }

    const result = await client.query(
      `INSERT INTO product_interests (
         business_id,
         product_id,
         customer_id,
         enquiry_id
       )
       VALUES ($1, $2, $3, $4)
       RETURNING id, business_id, product_id, customer_id,
                 enquiry_id, status, created_at, updated_at`,
      [
        businessId,
        productId,
        data.customerId,
        data.enquiryId || null,
      ]
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    if (error.code === "23505") {
      throw serviceError(
        "This customer is already on the waiting list for this product.",
        409
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function listProductInterests(
  businessId,
  productId,
  status
) {
  const product = await pool.query(
    `SELECT id
     FROM products
     WHERE business_id = $1
       AND id = $2`,
    [businessId, productId]
  );

  if (!product.rowCount) {
    throw serviceError("This product could not be found.", 404);
  }

  const values = [businessId, productId];
  let statusFilter = "";

  if (status) {
    values.push(status);
    statusFilter = `AND pi.status = $3`;
  }

  const result = await pool.query(
    `SELECT
       pi.id,
       pi.business_id,
       pi.product_id,
       pi.customer_id,
       pi.enquiry_id,
       pi.status,
       pi.created_at,
       pi.updated_at
     FROM product_interests pi
     WHERE pi.business_id = $1
       AND pi.product_id = $2
       ${statusFilter}
     ORDER BY pi.created_at ASC, pi.id ASC`,
    values
  );

  return result.rows;
}

export async function updateProductInterest(
  businessId,
  productId,
  interestId,
  status
) {
  const result = await pool.query(
    `UPDATE product_interests
     SET status = $4,
         updated_at = NOW()
     WHERE business_id = $1
       AND product_id = $2
       AND id = $3
       AND status IN ('waiting', 'notified')
     RETURNING id, business_id, product_id, customer_id,
               enquiry_id, status, created_at, updated_at`,
    [businessId, productId, interestId, status]
  );

  if (!result.rowCount) {
    throw serviceError(
      "The product interest could not be found or has already been closed.",
      404
    );
  }

  return result.rows[0];
}
