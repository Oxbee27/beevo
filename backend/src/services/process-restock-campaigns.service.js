import { randomUUID } from "node:crypto";
import pool from "../config/database.js";

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 1000;

function getRecipientLimit(campaign, existingRecipientCount) {
  const limits = [
    Number(campaign.batch_size || DEFAULT_BATCH_SIZE),
    MAX_BATCH_SIZE,
  ];

  if (campaign.max_recipients !== null) {
    limits.push(
      Number(campaign.max_recipients) - existingRecipientCount
    );
  }

  // FIFO campaigns use the restocked quantity as their default stock limit.
  if (campaign.selection_mode === "fifo") {
    limits.push(
      Number(campaign.stock_limit) - existingRecipientCount
    );
  }

  return Math.max(0, Math.min(...limits));
}

async function selectEligibleInterests(client, campaign, limit) {
  const result = await client.query(
    `
      SELECT
        i.id AS interest_id,
        i.customer_id,
        selected_channel.channel,
        selected_channel.recipient
      FROM product_interests i
      INNER JOIN customers c
        ON c.business_id = i.business_id
       AND c.id = i.customer_id
      CROSS JOIN LATERAL (
        SELECT
          p.channel,
          CASE
            WHEN p.channel = 'email' THEN c.email
            WHEN p.channel = 'sms' THEN c.phone
          END AS recipient
        FROM customer_communication_preferences p
        WHERE p.business_id = i.business_id
          AND p.customer_id = i.customer_id
          AND p.consent_status = 'granted'
          AND (
            (
              p.channel = 'email'
              AND NULLIF(BTRIM(c.email), '') IS NOT NULL
            )
            OR
            (
              p.channel = 'sms'
              AND c.phone ~ '^\\+[1-9][0-9]{7,14}$'
            )
          )
          AND p.channel IN ('email', 'sms')
        ORDER BY
          CASE p.channel
            WHEN 'email' THEN 1
            WHEN 'sms' THEN 2
            ELSE 3
          END
        LIMIT 1
      ) selected_channel
      WHERE i.business_id = $1
        AND i.product_id = $2
        AND i.status = 'waiting'
        AND NOT EXISTS (
          SELECT 1
          FROM restock_campaign_recipients existing
          WHERE existing.business_id = i.business_id
            AND existing.campaign_id = $3
            AND existing.interest_id = i.id
        )
      ORDER BY i.created_at ASC, i.id ASC
      LIMIT $4
      FOR UPDATE OF i SKIP LOCKED
    `,
    [
      campaign.business_id,
      campaign.product_id,
      campaign.id,
      limit,
    ]
  );

  return result.rows;
}

async function createCampaignRecipient(
  client,
  campaign,
  product,
  interest
) {
  const recipientResult = await client.query(
    `
      INSERT INTO restock_campaign_recipients (
        business_id,
        campaign_id,
        interest_id,
        customer_id,
        channel,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'queued')
      ON CONFLICT (
        business_id,
        campaign_id,
        interest_id,
        channel
      ) DO NOTHING
      RETURNING id
    `,
    [
      campaign.business_id,
      campaign.id,
      interest.interest_id,
      interest.customer_id,
      interest.channel,
    ]
  );

  if (!recipientResult.rows.length) {
    return false;
  }

  const recipientId = recipientResult.rows[0].id;
  const subject = `${product.name} is back in stock`;
  const body =
    `Good news! ${product.name} is available again. ` +
    "You are receiving this message because you asked to be " +
    "notified when this product was back in stock. " +
    "Please contact us if you would like to place an order.";

  const idempotencyKey =
    `restock:${campaign.id}:${interest.interest_id}:${interest.channel}`;

  await client.query(
    `
      INSERT INTO follow_up_messages (
        business_id,
        follow_up_id,
        enquiry_id,
        customer_id,
        channel,
        recipient,
        subject,
        body,
        template_key,
        source_type,
        restock_recipient_id,
        status,
        scheduled_for,
        next_attempt_at,
        idempotency_key
      )
      VALUES (
        $1,
        NULL,
        NULL,
        $2,
        $3,
        $4,
        $5,
        $6,
        NULL,
        'restock',
        $7,
        'pending',
        NOW(),
        NOW(),
        $8
      )
      ON CONFLICT (business_id, idempotency_key) DO NOTHING
    `,
    [
      campaign.business_id,
      interest.customer_id,
      interest.channel,
      interest.recipient,
      interest.channel === "email" ? subject : null,
      body,
      recipientId,
      idempotencyKey,
    ]
  );

  return true;
}

async function finishOrContinueCampaign(
  client,
  campaign,
  batchWasFull
) {
  const outstandingResult = await client.query(
    `
      SELECT COUNT(*)::INTEGER AS outstanding_count
      FROM restock_campaign_recipients
      WHERE business_id = $1
        AND campaign_id = $2
        AND status IN ('queued', 'sending')
    `,
    [campaign.business_id, campaign.id]
  );

  const outstandingCount =
    Number(outstandingResult.rows[0]?.outstanding_count || 0);

  // A full selection batch may have more waiting interests even if
  // every message from this batch has already been delivered.
  const nextStatus =
    batchWasFull || outstandingCount > 0 ? "processing" : "completed";

  const nextRunDelay = batchWasFull ? "1 second" : "1 minute";

  await client.query(
    `
      UPDATE restock_campaigns
      SET
        status = $3,
        next_run_at = CASE
          WHEN $3 = 'completed' THEN next_run_at
          ELSE NOW() + $4::INTERVAL
        END,
        locked_at = NULL,
        locked_by = NULL,
        completed_at = CASE
          WHEN $3 = 'completed' THEN COALESCE(completed_at, NOW())
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE business_id = $1
        AND id = $2
    `,
    [
      campaign.business_id,
      campaign.id,
      nextStatus,
      nextRunDelay,
    ]
  );
}

/**
 * Selects interested customers and queues restock notifications.
 *
 * FIFO campaigns are capped by the restocked quantity.
 * "all" campaigns can notify beyond that quantity, subject to
 * max_recipients when configured.
 *
 * One channel is selected per customer: email first, then SMS.
 * WhatsApp is deliberately excluded until an approved template
 * can be configured for restock campaigns.
 *
 * This function queues messages only. The existing communication
 * worker remains responsible for delivery and prepaid billing.
 */
export async function processDueRestockCampaigns({
  db = pool,
  batchSize = DEFAULT_BATCH_SIZE,
  workerId = randomUUID(),
} = {}) {
  const requestedBatchSize = Number(batchSize);

  if (
    !Number.isInteger(requestedBatchSize) ||
    requestedBatchSize < 1 ||
    requestedBatchSize > MAX_BATCH_SIZE
  ) {
    throw new Error(
      `batchSize must be an integer between 1 and ${MAX_BATCH_SIZE}.`
    );
  }

  const client = await db.connect();

  const summary = {
    campaignsClaimed: 0,
    recipientsQueued: 0,
    campaignsCompleted: 0,
  };

  try {
    await client.query("BEGIN");

    const campaignsResult = await client.query(
      `
        SELECT
          rc.*,
          p.name AS product_name,
          p.is_active AS product_is_active
        FROM restock_campaigns rc
        INNER JOIN products p
          ON p.business_id = rc.business_id
         AND p.id = rc.product_id
        WHERE rc.status IN ('queued', 'processing')
          AND rc.next_run_at <= NOW()
          AND (
            rc.locked_at IS NULL
            OR rc.locked_at < NOW() - INTERVAL '10 minutes'
          )
          AND p.is_active = TRUE
          AND rc.selection_mode IN ('fifo', 'all')
        ORDER BY rc.next_run_at ASC, rc.id ASC
        LIMIT $1
        FOR UPDATE OF rc SKIP LOCKED
      `,
      [requestedBatchSize]
    );

    summary.campaignsClaimed = campaignsResult.rows.length;

    for (const campaign of campaignsResult.rows) {
      await client.query(
        `
          UPDATE restock_campaigns
          SET
            locked_at = NOW(),
            locked_by = $3,
            updated_at = NOW()
          WHERE business_id = $1
            AND id = $2
        `,
        [campaign.business_id, campaign.id, workerId]
      );

      const existingResult = await client.query(
        `
          SELECT COUNT(*)::INTEGER AS recipient_count
          FROM restock_campaign_recipients
          WHERE business_id = $1
            AND campaign_id = $2
        `,
        [campaign.business_id, campaign.id]
      );

      const existingRecipientCount =
        Number(existingResult.rows[0]?.recipient_count || 0);

      const recipientLimit = getRecipientLimit(
        campaign,
        existingRecipientCount
      );

      let queuedThisCampaign = 0;

      if (recipientLimit > 0) {
        const interests = await selectEligibleInterests(
          client,
          campaign,
          recipientLimit
        );

        for (const interest of interests) {
          const created = await createCampaignRecipient(
            client,
            campaign,
            { name: campaign.product_name },
            interest
          );

          if (created) {
            queuedThisCampaign += 1;
          }
        }
      }

      summary.recipientsQueued += queuedThisCampaign;

      // A full batch may have more eligible interests. An empty or
      // partial batch is checked again later while messages are pending.
      const batchWasFull =
        queuedThisCampaign >= recipientLimit &&
        recipientLimit > 0;

      await client.query(
        `
          UPDATE restock_campaigns
          SET
            queued_count = queued_count + $3,
            updated_at = NOW()
          WHERE business_id = $1
            AND id = $2
        `,
        [
          campaign.business_id,
          campaign.id,
          queuedThisCampaign,
        ]
      );

      await finishOrContinueCampaign(
        client,
        campaign,
        batchWasFull
      );

      const statusResult = await client.query(
        `
          SELECT status
          FROM restock_campaigns
          WHERE business_id = $1
            AND id = $2
        `,
        [campaign.business_id, campaign.id]
      );

      if (statusResult.rows[0]?.status === "completed") {
        summary.campaignsCompleted += 1;
      }
    }

    await client.query("COMMIT");

    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
