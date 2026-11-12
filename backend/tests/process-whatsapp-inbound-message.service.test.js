import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { connect },
}));

import {
  processWhatsAppInboundMessage,
} from "../src/services/process-whatsapp-inbound-message.service.js";

function createDatabase({
  classification = "unclassified",
  channelExists = true,
  duplicate = false,
} = {}) {
  const queries = [];

  const client = {
    query: vi.fn(async (sql, values = []) => {
      queries.push({ sql, values });

      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rowCount: 0, rows: [] };
      }

      if (sql.includes("FROM business_communication_channels")) {
        return {
          rowCount: channelExists ? 1 : 0,
          rows: channelExists
            ? [{ id: 12, business_id: 7 }]
            : [],
        };
      }

      if (sql.includes("INSERT INTO business_conversations")) {
        return {
          rowCount: 1,
          rows: [{ id: 45, classification_status: classification }],
        };
      }

      if (sql.includes("INSERT INTO conversation_messages")) {
        return {
          rowCount: duplicate ? 0 : 1,
          rows: duplicate ? [] : [{ id: 91 }],
        };
      }

      if (sql.includes("UPDATE business_conversations")) {
        return { rowCount: 1, rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }),
    release: vi.fn(),
  };

  return { client, queries };
}

const message = {
  phoneNumberId: "123456789012345",
  contactIdentifier: "2348012345678",
  contactDisplayName: "Customer",
  providerMessageId: "wamid.test.001",
  messageType: "text",
  body: "I would like to place an order.",
  receivedAt: "2026-11-12T10:00:00.000Z",
};

describe("WhatsApp inbound message processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an unclassified conversation without storing its message body", async () => {
    const db = createDatabase({ classification: "unclassified" });
    connect.mockResolvedValue(db.client);

    const result = await processWhatsAppInboundMessage(message);

    expect(result).toMatchObject({
      processed: true,
      stored: false,
      reason: "unclassified",
      conversationId: 45,
    });

    expect(
      db.queries.some(({ sql }) =>
        sql.includes("INSERT INTO conversation_messages"),
      ),
    ).toBe(false);

    expect(db.client.release).toHaveBeenCalledOnce();
  });

  it("does not store message content for excluded conversations", async () => {
    const db = createDatabase({ classification: "excluded" });
    connect.mockResolvedValue(db.client);

    const result = await processWhatsAppInboundMessage(message);

    expect(result.stored).toBe(false);
    expect(result.reason).toBe("excluded");

    expect(
      db.queries.some(({ sql }) =>
        sql.includes("INSERT INTO conversation_messages"),
      ),
    ).toBe(false);
  });

  it("stores the inbound message when the conversation is classified as business", async () => {
    const db = createDatabase({ classification: "business" });
    connect.mockResolvedValue(db.client);

    const result = await processWhatsAppInboundMessage(message);

    expect(result).toMatchObject({
      processed: true,
      stored: true,
      duplicate: false,
      conversationId: 45,
      messageId: 91,
    });

    const insert = db.queries.find(({ sql }) =>
      sql.includes("INSERT INTO conversation_messages"),
    );

    expect(insert).toBeDefined();
    expect(insert.values).toContain(message.body);
    expect(insert.values).toContain(message.providerMessageId);
  });

  it("does not duplicate an already received provider message", async () => {
    const db = createDatabase({
      classification: "business",
      duplicate: true,
    });
    connect.mockResolvedValue(db.client);

    const result = await processWhatsAppInboundMessage(message);

    expect(result).toMatchObject({
      processed: true,
      stored: false,
      duplicate: true,
      reason: "duplicate",
    });
  });

  it("does not advance the conversation timestamp for a duplicate business message", async () => {
    const db = createDatabase({
      classification: "business",
      duplicate: true,
    });
    connect.mockResolvedValue(db.client);

    const result = await processWhatsAppInboundMessage(message);

    expect(result.duplicate).toBe(true);

    expect(
      db.queries.some(({ sql }) =>
        sql.includes("UPDATE business_conversations"),
      ),
    ).toBe(false);
  });

  it("advances the conversation timestamp after storing a new business message", async () => {
    const db = createDatabase({ classification: "business" });
    connect.mockResolvedValue(db.client);

    const result = await processWhatsAppInboundMessage(message);

    expect(result.stored).toBe(true);

    const timestampUpdate = db.queries.find(({ sql }) =>
      sql.includes("UPDATE business_conversations"),
    );

    expect(timestampUpdate).toBeDefined();
    expect(timestampUpdate.values).toEqual([
      45,
      new Date(message.receivedAt),
    ]);
  });

  it("ignores messages for a channel that is not connected", async () => {
    const db = createDatabase({ channelExists: false });
    connect.mockResolvedValue(db.client);

    const result = await processWhatsAppInboundMessage(message);

    expect(result).toMatchObject({
      processed: false,
      reason: "channel_not_connected",
    });

    expect(
      db.queries.some(({ sql }) =>
        sql.includes("INSERT INTO business_conversations"),
      ),
    ).toBe(false);
  });

  it("rejects messages without the required provider identifiers", async () => {
    const result = await processWhatsAppInboundMessage({
      ...message,
      providerMessageId: "",
    });

    expect(result).toMatchObject({
      processed: false,
      reason: "invalid_message",
    });

    expect(connect).not.toHaveBeenCalled();
  });

  it("does not store a non-string body", async () => {
    const db = createDatabase({ classification: "business" });
    connect.mockResolvedValue(db.client);

    await processWhatsAppInboundMessage({
      ...message,
      body: { unexpected: "object" },
    });

    const insert = db.queries.find(({ sql }) =>
      sql.includes("INSERT INTO conversation_messages"),
    );

    expect(insert.values[5]).toBeNull();
  });
});
