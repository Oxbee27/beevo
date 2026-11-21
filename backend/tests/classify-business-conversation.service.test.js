import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { connect },
}));

import { classifyBusinessConversation } from "../src/services/classify-business-conversation.service.js";

const client = {
  query: vi.fn(),
  release: vi.fn(),
};

let initialClassification;

describe("classifyBusinessConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initialClassification = "unclassified";

    connect.mockResolvedValue(client);

    client.query.mockImplementation(async (sql) => {
      if (sql.includes("FROM business_conversations")) {
        return {
          rowCount: 1,
          rows: [{
            id: 10,
            classification_status: initialClassification,
          }],
        };
      }

      if (sql.includes("FROM customers")) {
        return { rowCount: 1, rows: [{ id: 6 }] };
      }

      if (sql.startsWith("UPDATE business_conversations")) {
        return {
          rowCount: 1,
          rows: [{ id: 10, customer_id: 6 }],
        };
      }

      if (sql.includes("INSERT INTO conversation_messages")) {
        return { rowCount: 2, rows: [] };
      }

      if (sql.includes("DELETE FROM pending_conversation_messages")) {
        return { rowCount: 2, rows: [] };
      }

      return { rowCount: 0, rows: [] };
    });
  });

  it("preserves the existing customer link when requested", async () => {
    await classifyBusinessConversation({
      businessId: 7,
      conversationId: 10,
      classification: "business",
      preserveCustomer: true,
      userId: 4,
    });

    const update = client.query.mock.calls.find(([sql]) =>
      sql.startsWith("UPDATE business_conversations"),
    );

    expect(update[0]).toContain(
      "customer_id = CASE WHEN $6 THEN customer_id ELSE $4 END",
    );
    expect(update[1][3]).toBeNull();
    expect(update[1][5]).toBe(true);
  });

  it("clears the customer link when null is explicitly supplied", async () => {
    await classifyBusinessConversation({
      businessId: 7,
      conversationId: 10,
      classification: "business",
      customerId: null,
      preserveCustomer: false,
      userId: 4,
    });

    const update = client.query.mock.calls.find(([sql]) =>
      sql.startsWith("UPDATE business_conversations"),
    );

    expect(update[1][3]).toBeNull();
    expect(update[1][5]).toBe(false);
  });

  it("validates and applies an explicitly supplied customer ID", async () => {
    await classifyBusinessConversation({
      businessId: 7,
      conversationId: 10,
      classification: "business",
      customerId: 6,
      preserveCustomer: false,
      userId: 4,
    });

    const customerCheck = client.query.mock.calls.find(([sql]) =>
      sql.includes("FROM customers"),
    );
    const update = client.query.mock.calls.find(([sql]) =>
      sql.startsWith("UPDATE business_conversations"),
    );

    expect(customerCheck[1]).toEqual([7, 6]);
    expect(update[1][3]).toBe(6);
    expect(update[1][5]).toBe(false);
  });

  it("does not preserve a customer link when excluding a conversation", async () => {
    await classifyBusinessConversation({
      businessId: 7,
      conversationId: 10,
      classification: "excluded",
      customerId: null,
      preserveCustomer: false,
      userId: 4,
    });

    const update = client.query.mock.calls.find(([sql]) =>
      sql.startsWith("UPDATE business_conversations"),
    );

    expect(update[1][2]).toBe("excluded");
    expect(update[1][3]).toBeNull();
    expect(update[1][5]).toBe(false);
  });

  it("moves pending messages into conversation history when approved", async () => {
    await classifyBusinessConversation({
      businessId: 7,
      conversationId: 10,
      classification: "business",
      preserveCustomer: true,
      userId: 4,
    });

    const calls = client.query.mock.calls;

    const transferIndex = calls.findIndex(([sql]) =>
      sql.includes("INSERT INTO conversation_messages"),
    );

    const deleteIndex = calls.findIndex(([sql]) =>
      sql.includes("DELETE FROM pending_conversation_messages"),
    );

    expect(transferIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(transferIndex);

    const transferSql = calls[transferIndex][0];

    expect(transferSql).toContain("FROM pending_conversation_messages");
    expect(transferSql).toContain("'inbound'");
    expect(transferSql).toContain("'received'");
    expect(transferSql).toContain("ON CONFLICT");

    expect(calls[transferIndex][1]).toEqual([7, 10]);
    expect(calls[deleteIndex][1]).toEqual([7, 10]);
    expect(calls.at(-1)[0]).toBe("COMMIT");
  });

  it("deletes pending content without transferring it when excluded", async () => {
    await classifyBusinessConversation({
      businessId: 7,
      conversationId: 10,
      classification: "excluded",
      customerId: null,
      preserveCustomer: false,
      userId: 4,
    });

    const calls = client.query.mock.calls;

    const transfer = calls.find(([sql]) =>
      sql.includes("INSERT INTO conversation_messages"),
    );

    const deletion = calls.find(([sql]) =>
      sql.includes("DELETE FROM pending_conversation_messages"),
    );

    expect(transfer).toBeUndefined();
    expect(deletion).toBeDefined();
    expect(deletion[1]).toEqual([7, 10]);
    expect(calls.at(-1)[0]).toBe("COMMIT");
  });

  it("does not transfer pending messages again when already classified as business", async () => {
    initialClassification = "business";

    await classifyBusinessConversation({
      businessId: 7,
      conversationId: 10,
      classification: "business",
      preserveCustomer: true,
      userId: 4,
    });

    const transfer = client.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO conversation_messages"),
    );

    expect(transfer).toBeUndefined();
  });
});
