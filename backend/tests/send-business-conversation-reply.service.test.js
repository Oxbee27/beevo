import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { connect },
}));

import {
  sendBusinessConversationReply,
} from "../src/services/send-business-conversation-reply.service.js";

const client = {
  query: vi.fn(),
  release: vi.fn(),
};

let conversation;

const templateComponents = [
  {
    type: "body",
    parameters: [
      { type: "text", text: "Ada" },
      { type: "text", text: "Order 123" },
    ],
  },
];

describe("sendBusinessConversationReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    conversation = {
      id: 10,
      customer_id: 6,
      contact_identifier: "+2348012345678",
      conversation_status: "open",
      classification_status: "business",
      channel_connection_id: 3,
      channel: "whatsapp",
      is_active: true,
      connection_status: "connected",
    };

    connect.mockResolvedValue(client);

    client.query.mockImplementation(async (sql) => {
      const normalized = sql.trim();

      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) {
        return { rowCount: null, rows: [] };
      }

      if (normalized.includes("FROM business_conversations c")) {
        return { rowCount: 1, rows: [conversation] };
      }

      if (normalized.includes("FROM customer_communication_preferences")) {
        return {
          rowCount: 1,
          rows: [{ consent_status: "granted" }],
        };
      }

      if (
        normalized.startsWith("SELECT") &&
        normalized.includes("FROM follow_up_messages")
      ) {
        return { rowCount: 0, rows: [] };
      }

      if (normalized.includes("INSERT INTO conversation_messages")) {
        return {
          rowCount: 1,
          rows: [{
            id: 501,
            conversation_id: 10,
            direction: "outbound",
            message_type: "template",
            body: "WhatsApp template: order_update",
            delivery_status: "queued",
            created_at: new Date(),
          }],
        };
      }

      if (normalized.includes("INSERT INTO follow_up_messages")) {
        return {
          rowCount: 1,
          rows: [{
            id: 601,
            status: "pending",
            channel: conversation.channel,
            conversation_id: 10,
            conversation_message_id: 501,
            created_at: new Date(),
          }],
        };
      }

      if (normalized.startsWith("UPDATE business_conversations")) {
        return { rowCount: 1, rows: [] };
      }

      return { rowCount: 0, rows: [] };
    });
  });

  it("persists WhatsApp template parameters in the queue and conversation history", async () => {
    const result = await sendBusinessConversationReply({
      businessId: 7,
      conversationId: 10,
      userId: 4,
      templateKey: "order_update",
      templateComponents,
      idempotencyKey: "whatsapp-reply-001",
    });

    expect(result.duplicate).toBe(false);
    expect(result.message.id).toBe(601);

    const timelineInsert = client.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO conversation_messages"),
    );

    expect(timelineInsert[1][3]).toBe("template");
    expect(timelineInsert[1][4]).toBe("WhatsApp template: order_update");

    const metadata = JSON.parse(timelineInsert[1][6]);

    expect(metadata).toEqual({
      templateKey: "order_update",
      templateComponents,
    });

    const queueInsert = client.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO follow_up_messages"),
    );

    expect(queueInsert[1][8]).toBe("order_update");
    expect(JSON.parse(queueInsert[1][9])).toEqual(templateComponents);
    expect(queueInsert[1][10]).toBe("whatsapp-reply-001");

    expect(client.query.mock.calls.at(-1)[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects invalid WhatsApp template parameters without queuing a message", async () => {
    await expect(
      sendBusinessConversationReply({
        businessId: 7,
        conversationId: 10,
        userId: 4,
        templateKey: "order_update",
        templateComponents: [{
          type: "body",
          parameters: [{
            type: "text",
            text: "   ",
          }],
        }],
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "The WhatsApp template parameters are invalid.",
    });

    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO conversation_messages"),
      ),
    ).toBe(false);

    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO follow_up_messages"),
      ),
    ).toBe(false);

    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects WhatsApp replies with an invalid template name", async () => {
    await expect(
      sendBusinessConversationReply({
        businessId: 7,
        conversationId: 10,
        userId: 4,
        templateKey: "Order Update!",
        templateComponents: [],
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Enter a valid approved WhatsApp template name.",
    });

    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO follow_up_messages"),
      ),
    ).toBe(false);

    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
  });

  it("queues ordinary SMS replies without WhatsApp template components", async () => {
    conversation.channel = "sms";

    const result = await sendBusinessConversationReply({
      businessId: 7,
      conversationId: 10,
      userId: 4,
      body: "Your order is ready.",
      idempotencyKey: "sms-reply-001",
    });

    expect(result.duplicate).toBe(false);

    const timelineInsert = client.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO conversation_messages"),
    );

    expect(timelineInsert[1][3]).toBe("text");
    expect(timelineInsert[1][4]).toBe("Your order is ready.");
    expect(JSON.parse(timelineInsert[1][6])).toEqual({});

    const queueInsert = client.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO follow_up_messages"),
    );

    expect(queueInsert[1][4]).toBe("sms");
    expect(queueInsert[1][7]).toBe("Your order is ready.");
    expect(JSON.parse(queueInsert[1][9])).toEqual([]);

    expect(client.query.mock.calls.at(-1)[0]).toBe("COMMIT");
  });
});
