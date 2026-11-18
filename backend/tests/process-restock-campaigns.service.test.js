import { describe, it, expect, vi } from "vitest";
import { processDueRestockCampaigns } from "../src/services/process-restock-campaigns.service.js";

function createHarness({
  campaigns = [],
  interests = [],
  existingRecipientCount = 0,
} = {}) {
  const state = {
    queries: [],
    recipients: [],
    messages: [],
    campaignStatuses: [],
    released: false,
    committed: false,
    rolledBack: false,
    interestLimit: null,
  };

  const client = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      state.queries.push({ sql: normalized, values });

      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) {
        if (normalized === "COMMIT") state.committed = true;
        if (normalized === "ROLLBACK") state.rolledBack = true;
        return { rows: [], rowCount: null };
      }

      if (normalized.startsWith("SELECT rc.*")) {
        return { rows: campaigns };
      }

      if (
        normalized.startsWith("UPDATE restock_campaigns") &&
        normalized.includes("SET locked_at = NOW()")
      ) {
        return { rows: [], rowCount: 1 };
      }

      if (
        normalized.includes("SELECT COUNT(*)::INTEGER AS recipient_count")
      ) {
        return {
          rows: [{ recipient_count: existingRecipientCount }],
        };
      }

      if (normalized.includes("FROM product_interests i")) {
        state.interestLimit = values[3];

        expect(normalized).toContain("i.status = 'waiting'");
        expect(normalized).toContain("ORDER BY i.created_at ASC, i.id ASC");
        expect(normalized).toContain("FOR UPDATE OF i SKIP LOCKED");
        expect(normalized).toContain("p.consent_status = 'granted'");
        expect(normalized).toContain("p.channel IN ('email', 'sms')");

        return {
          rows: interests.slice(0, values[3]),
        };
      }

      if (normalized.startsWith("INSERT INTO restock_campaign_recipients")) {
        const recipient = {
          id: state.recipients.length + 1,
          businessId: values[0],
          campaignId: values[1],
          interestId: values[2],
          customerId: values[3],
          channel: values[4],
          status: "queued",
        };

        state.recipients.push(recipient);

        return {
          rows: [{ id: recipient.id }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith("INSERT INTO follow_up_messages")) {
        state.messages.push({
          businessId: values[0],
          customerId: values[1],
          channel: values[2],
          recipient: values[3],
          subject: values[4],
          body: values[5],
          restockRecipientId: values[6],
          idempotencyKey: values[7],
        });

        return { rows: [], rowCount: 1 };
      }

      if (
        normalized.includes("SELECT COUNT(*)::INTEGER AS outstanding_count")
      ) {
        return {
          rows: [{
            outstanding_count: state.recipients.length,
          }],
        };
      }

      if (
        normalized.startsWith("UPDATE restock_campaigns") &&
        normalized.includes("SET status = $3")
      ) {
        state.campaignStatuses.push({
          status: values[2],
          delay: values[3],
        });

        return { rows: [], rowCount: 1 };
      }

      if (
        normalized.startsWith("UPDATE restock_campaigns") &&
        normalized.includes("SET queued_count = queued_count + $3")
      ) {
        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith("SELECT status FROM restock_campaigns")) {
        return {
          rows: [{
            status: state.campaignStatuses.at(-1)?.status ?? "queued",
          }],
        };
      }

      throw new Error(`Unexpected test SQL: ${normalized}`);
    },

    release() {
      state.released = true;
    },
  };

  const db = {
    connect: vi.fn().mockResolvedValue(client),
  };

  return { db, state };
}

const baseCampaign = {
  id: 10,
  business_id: 5,
  product_id: 20,
  product_name: "Beevo Smart Watch",
  product_is_active: true,
  selection_mode: "fifo",
  batch_size: 100,
  max_recipients: null,
  stock_limit: 2,
};

const sampleInterests = [
  {
    interest_id: 101,
    customer_id: 201,
    channel: "email",
    recipient: "customer1@example.com",
  },
  {
    interest_id: 102,
    customer_id: 202,
    channel: "sms",
    recipient: "+2348012345678",
  },
  {
    interest_id: 103,
    customer_id: 203,
    channel: "email",
    recipient: "customer3@example.com",
  },
];

describe("Beevo restock campaign processor", () => {
  it("queues no more FIFO recipients than the restocked quantity", async () => {
    const { db, state } = createHarness({
      campaigns: [baseCampaign],
      interests: sampleInterests,
    });

    const result = await processDueRestockCampaigns({ db });

    expect(result).toEqual({
      campaignsClaimed: 1,
      recipientsQueued: 2,
      campaignsCompleted: 0,
    });

    expect(state.interestLimit).toBe(2);
    expect(state.recipients).toHaveLength(2);
    expect(state.messages).toHaveLength(2);
    expect(state.campaignStatuses[0].status).toBe("processing");
    expect(state.committed).toBe(true);
    expect(state.rolledBack).toBe(false);
    expect(state.released).toBe(true);
  });

  it("respects max_recipients for all-selection campaigns", async () => {
    const campaign = {
      ...baseCampaign,
      selection_mode: "all",
      max_recipients: 2,
      stock_limit: null,
    };

    const { db, state } = createHarness({
      campaigns: [campaign],
      interests: sampleInterests,
    });

    const result = await processDueRestockCampaigns({ db });

    expect(result.recipientsQueued).toBe(2);
    expect(state.interestLimit).toBe(2);
    expect(state.recipients).toHaveLength(2);
    expect(state.messages).toHaveLength(2);
  });

  it("subtracts existing recipients from the FIFO stock limit", async () => {
    const { db, state } = createHarness({
      campaigns: [baseCampaign],
      interests: sampleInterests,
      existingRecipientCount: 1,
    });

    const result = await processDueRestockCampaigns({ db });

    expect(result.recipientsQueued).toBe(1);
    expect(state.interestLimit).toBe(1);
    expect(state.recipients).toHaveLength(1);
    expect(state.messages).toHaveLength(1);
  });

  it("queues one message per recipient with a source-specific idempotency key", async () => {
    const { db, state } = createHarness({
      campaigns: [baseCampaign],
      interests: sampleInterests,
    });

    await processDueRestockCampaigns({ db });

    expect(state.messages).toHaveLength(2);

    expect(state.messages[0]).toMatchObject({
      businessId: 5,
      customerId: 201,
      channel: "email",
      recipient: "customer1@example.com",
      subject: "Beevo Smart Watch is back in stock",
      restockRecipientId: 1,
      idempotencyKey: "restock:10:101:email",
    });

    expect(state.messages[1]).toMatchObject({
      businessId: 5,
      customerId: 202,
      channel: "sms",
      recipient: "+2348012345678",
      subject: null,
      restockRecipientId: 2,
      idempotencyKey: "restock:10:102:sms",
    });

    for (const message of state.messages) {
      expect(message.body).toContain("available again");
    }
  });

  it("completes a campaign when no eligible interests are found", async () => {
    const { db, state } = createHarness({
      campaigns: [baseCampaign],
      interests: [],
    });

    const result = await processDueRestockCampaigns({ db });

    expect(result).toEqual({
      campaignsClaimed: 1,
      recipientsQueued: 0,
      campaignsCompleted: 1,
    });

    expect(state.messages).toHaveLength(0);
    expect(state.campaignStatuses[0].status).toBe("completed");
    expect(state.committed).toBe(true);
  });

  it("does not process campaigns when none are due", async () => {
    const { db, state } = createHarness();

    const result = await processDueRestockCampaigns({ db });

    expect(result).toEqual({
      campaignsClaimed: 0,
      recipientsQueued: 0,
      campaignsCompleted: 0,
    });

    expect(state.messages).toHaveLength(0);
    expect(state.committed).toBe(true);
  });

  it("rejects invalid batch sizes before connecting to the database", async () => {
    const { db } = createHarness();

    await expect(
      processDueRestockCampaigns({ db, batchSize: 0 })
    ).rejects.toThrow("batchSize must be an integer");

    await expect(
      processDueRestockCampaigns({ db, batchSize: 1001 })
    ).rejects.toThrow("batchSize must be an integer");

    await expect(
      processDueRestockCampaigns({ db, batchSize: 1.5 })
    ).rejects.toThrow("batchSize must be an integer");

    expect(db.connect).not.toHaveBeenCalled();
  });

  it("rolls back and releases the client when processing fails", async () => {
    const { db, state } = createHarness({
      campaigns: [baseCampaign],
    });

    const originalConnect = db.connect;

    db.connect = vi.fn(async () => {
      const client = await originalConnect();

      const originalQuery = client.query.bind(client);

      client.query = async (sql, values) => {
        if (sql.includes("SELECT COUNT(*)::INTEGER AS recipient_count")) {
          throw new Error("Simulated database failure");
        }

        return originalQuery(sql, values);
      };

      return client;
    });

    await expect(
      processDueRestockCampaigns({ db })
    ).rejects.toThrow("Simulated database failure");

    expect(state.rolledBack).toBe(true);
    expect(state.committed).toBe(false);
    expect(state.released).toBe(true);
  });
});
