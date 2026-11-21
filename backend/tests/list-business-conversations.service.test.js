import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { query },
}));

import {
  listBusinessConversations,
  getBusinessConversation,
} from "../src/services/list-business-conversations.service.js";

describe("Business conversation visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["unclassified", "excluded"])(
    "never exposes %s conversations through the normal list",
    async (classification) => {
      query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await listBusinessConversations(7, {
        classification,
      });

      expect(result.conversations).toEqual([]);
      expect(query).toHaveBeenCalledTimes(2);

      for (const [sql, values] of query.mock.calls) {
        expect(sql).toContain("c.business_id = $1");
        expect(sql).toContain(
          "c.classification_status = 'business'",
        );
        expect(values).toContain(7);
        expect(values).toContain(classification);
      }
    },
  );

  it("retains business-only filtering when listing business conversations", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [{ id: 20, classification_status: "business" }],
      });

    const result = await listBusinessConversations(7, {
      classification: "business",
    });

    expect(result.conversations).toHaveLength(1);
    expect(result.pagination.total).toBe(1);

    expect(query.mock.calls[0][0]).toContain(
      "c.classification_status = 'business'",
    );
    expect(query.mock.calls[1][0]).toContain(
      "c.classification_status = 'business'",
    );
    expect(query.mock.calls[0][1][0]).toBe(7);
    expect(query.mock.calls[1][1][0]).toBe(7);
  });

  it("does not return an unclassified or excluded conversation by ID", async () => {
    query.mockResolvedValueOnce({
      rowCount: 0,
      rows: [],
    });

    const result = await getBusinessConversation(7, 20);

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);

    const [sql, values] = query.mock.calls[0];

    expect(sql).toContain("c.business_id = $1");
    expect(sql).toContain("c.id = $2");
    expect(sql).toContain(
      "c.classification_status = 'business'",
    );
    expect(values).toEqual([7, 20]);
  });

  it("returns messages only after finding a business conversation in the same business", async () => {
    query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 20, business_id: 7, classification_status: "business" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 31, body: "Approved message" }],
      });

    const result = await getBusinessConversation(7, 20);

    expect(result.conversation.id).toBe(20);
    expect(result.messages).toEqual([
      { id: 31, body: "Approved message" },
    ]);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain(
      "WHERE business_id = $1",
    );
    expect(query.mock.calls[1][0]).toContain(
      "AND conversation_id = $2",
    );
    expect(query.mock.calls[1][1]).toEqual([7, 20]);
  });
});
