import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { query },
}));

import {
  listCommunicationsMessages,
  getCommunicationsMessage,
  getCommunicationsOverview,
} from "../src/services/list-communications-messages.service.js";

describe("Unified communications history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists messages with business isolation, filters and pagination", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [{ id: 12, channel: "email", status: "delivered" }],
      });

    const result = await listCommunicationsMessages(7, {
      channel: "email",
      status: "delivered",
      customerId: 6,
      followUpId: 4,
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
      page: 1,
      limit: 10,
    });

    expect(query).toHaveBeenCalledTimes(2);

    const [countSql, countValues] = query.mock.calls[0];
    expect(countSql).toContain("business_id = $1");
    expect(countSql).toContain("channel = $2");
    expect(countSql).toContain("status = $3");
    expect(countValues).toEqual([
      7,
      "email",
      "delivered",
      6,
      4,
      "2026-01-01T00:00:00Z",
      "2026-12-31T23:59:59Z",
    ]);

    expect(result.messages).toHaveLength(1);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it("returns an empty page when no messages match", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await listCommunicationsMessages(7, {
      page: 2,
      limit: 20,
    });

    expect(result.messages).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
    expect(query.mock.calls[1][1]).toEqual([7, 20, 20]);
  });

  it("retrieves one business-scoped message and its delivery attempts", async () => {
    query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 12, status: "delivered" }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, attempt_number: 1, status: "sent" },
          { id: 2, attempt_number: 2, status: "sent" },
        ],
      });

    const result = await getCommunicationsMessage(7, 12);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1]).toEqual([7, 12]);
    expect(query.mock.calls[1][1]).toEqual([7, 12]);
    expect(result.id).toBe(12);
    expect(result.attempts).toHaveLength(2);
  });

  it("returns null when a message does not belong to the business", async () => {
    query.mockResolvedValueOnce({
      rowCount: 0,
      rows: [],
    });

    const result = await getCommunicationsMessage(7, 99);

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("aggregates message totals and delivery rate by channel", async () => {
    query.mockResolvedValueOnce({
      rows: [
        { channel: "email", status: "delivered", count: 8 },
        { channel: "email", status: "failed", count: 2 },
        { channel: "sms", status: "pending", count: 3 },
        { channel: "whatsapp", status: "unknown", count: 1 },
      ],
    });

    const result = await getCommunicationsOverview(7);

    expect(query.mock.calls[0][1]).toEqual([7]);
    expect(result.totals.total).toBe(14);
    expect(result.totals.delivered).toBe(8);
    expect(result.totals.failed).toBe(2);
    expect(result.byChannel.email.total).toBe(10);
    expect(result.byChannel.sms.pending).toBe(3);
    expect(result.byChannel.whatsapp.unknown).toBe(1);
    expect(result.deliveryRate).toBe(80);
  });

  it("returns a null delivery rate when no messages are completed", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await getCommunicationsOverview(7);

    expect(result.totals.total).toBe(0);
    expect(result.deliveryRate).toBeNull();
  });
});
