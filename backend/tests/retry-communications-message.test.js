import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect, query, release } = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { connect },
}));

import {
  retryCommunicationsMessage,
} from "../src/services/retry-communications-message.service.js";

function setupMessage(message) {
  const client = {
    query: vi.fn(),
    release,
  };

  client.query
    .mockResolvedValueOnce({}) // BEGIN
    .mockResolvedValueOnce({
      rowCount: message ? 1 : 0,
      rows: message ? [message] : [],
    });

  connect.mockResolvedValue(client);

  return client;
}

describe("Retry communications message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for a message outside the business", async () => {
    const client = setupMessage(null);

    const result = await retryCommunicationsMessage(7, 999);

    expect(result.message).toBeNull();
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("rejects an unknown delivery outcome", async () => {
    const client = setupMessage({
      id: 12,
      status: "unknown",
      attempt_count: 1,
      max_attempts: 3,
      follow_up_pending: true,
      consent_granted: true,
    });

    const result = await retryCommunicationsMessage(7, 12);

    expect(result.conflict).toBe(true);
    expect(result.reason).toContain("definitively failed");
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it("rejects messages when consent has been withdrawn", async () => {
    const client = setupMessage({
      id: 12,
      status: "failed",
      attempt_count: 3,
      max_attempts: 3,
      follow_up_pending: true,
      consent_granted: false,
    });

    const result = await retryCommunicationsMessage(7, 12);

    expect(result.conflict).toBe(true);
    expect(result.reason).toContain("consent");
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it("rejects messages whose follow-up is no longer pending", async () => {
    const client = setupMessage({
      id: 12,
      status: "failed",
      attempt_count: 3,
      max_attempts: 3,
      follow_up_pending: false,
      consent_granted: true,
    });

    const result = await retryCommunicationsMessage(7, 12);

    expect(result.conflict).toBe(true);
    expect(result.reason).toContain("follow-up");
  });

  it("queues one additional attempt for an eligible failed message", async () => {
    const client = setupMessage({
      id: 12,
      status: "failed",
      attempt_count: 3,
      max_attempts: 3,
      follow_up_pending: true,
      consent_granted: true,
    });

    client.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 12,
          status: "pending",
          attempt_count: 3,
          max_attempts: 4,
        }],
      })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await retryCommunicationsMessage(7, 12);

    expect(result.conflict).toBe(false);
    expect(result.message.status).toBe("pending");
    expect(result.message.max_attempts).toBe(4);

    const updateCall = client.query.mock.calls[2];
    expect(updateCall[0]).toContain("status = 'pending'");
    expect(updateCall[0]).toContain(
      "WHEN $3 = 'failed' THEN attempt_count + 1",
    );
    expect(updateCall[0]).toContain("ELSE max_attempts");
    expect(updateCall[1]).toEqual([7, 12, "failed"]);
  });

  it("resumes a billing-blocked message without consuming another attempt", async () => {
    const client = setupMessage({
      id: 12,
      status: "billing_blocked",
      attempt_count: 2,
      max_attempts: 4,
      follow_up_pending: true,
      consent_granted: true,
    });

    client.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 12,
          status: "pending",
          attempt_count: 2,
          max_attempts: 4,
        }],
      })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await retryCommunicationsMessage(7, 12);

    expect(result.conflict).toBe(false);
    expect(result.message.status).toBe("pending");
    expect(result.message.attempt_count).toBe(2);
    expect(result.message.max_attempts).toBe(4);

    const updateCall = client.query.mock.calls[2];
    expect(updateCall[0]).toContain("ELSE max_attempts");
    expect(updateCall[0]).not.toMatch(/attempt_count\\s*=/);
    expect(updateCall[1]).toEqual([7, 12, "billing_blocked"]);
  });

  it("enforces the hard attempt ceiling", async () => {
    const client = setupMessage({
      id: 12,
      status: "failed",
      attempt_count: 10,
      max_attempts: 10,
      follow_up_pending: true,
      consent_granted: true,
    });

    const result = await retryCommunicationsMessage(7, 12);

    expect(result.conflict).toBe(true);
    expect(result.reason).toContain("maximum");
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it("rolls back when the database update fails", async () => {
    const client = setupMessage({
      id: 12,
      status: "failed",
      attempt_count: 3,
      max_attempts: 3,
      follow_up_pending: true,
      consent_granted: true,
    });

    client.query
      .mockRejectedValueOnce(new Error("Database failure"))
      .mockResolvedValueOnce({});

    await expect(
      retryCommunicationsMessage(7, 12),
    ).rejects.toThrow("Database failure");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });
});
