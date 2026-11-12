import { beforeEach, describe, expect, it, vi } from "vitest";

const { retryCommunicationsMessage } = vi.hoisted(() => ({
  retryCommunicationsMessage: vi.fn(),
}));

vi.mock("../src/services/retry-communications-message.service.js", () => ({
  retryCommunicationsMessage,
}));

import {
  retryCommunicationsMessageController,
} from "../src/controllers/communications.controller.js";

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

describe("Retry communications controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid message ID", async () => {
    const res = createResponse();

    await retryCommunicationsMessageController(
      { params: { id: "invalid" }, user: { businessId: 7 } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(retryCommunicationsMessage).not.toHaveBeenCalled();
  });

  it("returns 404 for a message not found in the business", async () => {
    retryCommunicationsMessage.mockResolvedValue({
      message: null,
      conflict: false,
    });

    const res = createResponse();

    await retryCommunicationsMessageController(
      { params: { id: "12" }, user: { businessId: 7 } },
      res,
    );

    expect(retryCommunicationsMessage).toHaveBeenCalledWith(7, 12);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 409 when retry is not safe", async () => {
    retryCommunicationsMessage.mockResolvedValue({
      message: { id: 12, status: "unknown" },
      conflict: true,
      reason: "Only definitively failed messages can be manually retried.",
    });

    const res = createResponse();

    await retryCommunicationsMessageController(
      { params: { id: "12" }, user: { businessId: 7 } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("returns success when a retry is queued", async () => {
    retryCommunicationsMessage.mockResolvedValue({
      message: { id: 12, status: "pending", max_attempts: 4 },
      conflict: false,
    });

    const res = createResponse();

    await retryCommunicationsMessageController(
      { params: { id: "12" }, user: { businessId: 7 } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ status: "pending" }),
    }));
  });

  it("does not expose internal database errors", async () => {
    retryCommunicationsMessage.mockRejectedValue(
      new Error("Sensitive database details"),
    );

    const res = createResponse();

    await retryCommunicationsMessageController(
      { params: { id: "12" }, user: { businessId: 7 } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: "Something went wrong while retrying the message.",
    }));
  });
});
