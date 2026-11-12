import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listCommunicationsMessages,
  getCommunicationsMessage,
  getCommunicationsOverview,
  getCommunicationChannelReadiness,
} = vi.hoisted(() => ({
  listCommunicationsMessages: vi.fn(),
  getCommunicationsMessage: vi.fn(),
  getCommunicationsOverview: vi.fn(),
  getCommunicationChannelReadiness: vi.fn(),
}));

vi.mock("../src/services/list-communications-messages.service.js", () => ({
  listCommunicationsMessages,
  getCommunicationsMessage,
  getCommunicationsOverview,
}));

vi.mock("../src/services/get-communication-channel-readiness.service.js", () => ({
  getCommunicationChannelReadiness,
}));

import {
  getCommunicationChannelsController,
  listCommunicationsMessagesController,
  getCommunicationsMessageController,
  getCommunicationsOverviewController,
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

function createRequest({ query = {}, params = {}, businessId = 7 } = {}) {
  return {
    query,
    params,
    user: { businessId },
  };
}

describe("Communications controllers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns channel readiness without exposing credentials", () => {
    const readiness = {
      channels: {
        email: { configured: true, status: "configured", missing: [] },
        sms: { configured: false, status: "not_configured", missing: ["TERMII_API_KEY"] },
        whatsapp: { configured: false, status: "not_configured", missing: ["WHATSAPP_ACCESS_TOKEN"] },
      },
      webhooks: { resend: true, termii: false, whatsapp: false },
    };

    getCommunicationChannelReadiness.mockReturnValue(readiness);

    const res = createResponse();

    getCommunicationChannelsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: readiness,
    }));
  });

  it("rejects an unsupported channel filter", async () => {
    const res = createResponse();

    await listCommunicationsMessagesController(
      createRequest({ query: { channel: "telegram" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(listCommunicationsMessages).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination and date ranges", async () => {
    const invalidQueries = [
      { page: "0" },
      { limit: "101" },
      { from: "not-a-date" },
      { from: "2026-12-01", to: "2026-11-01" },
      { customerId: "-3" },
    ];

    for (const query of invalidQueries) {
      const res = createResponse();

      await listCommunicationsMessagesController(
        createRequest({ query }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
    }

    expect(listCommunicationsMessages).not.toHaveBeenCalled();
  });

  it("lists messages using the authenticated business and validated filters", async () => {
    const result = {
      messages: [{ id: 12, channel: "email", status: "delivered" }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };

    listCommunicationsMessages.mockResolvedValue(result);

    const res = createResponse();

    await listCommunicationsMessagesController(
      createRequest({
        businessId: 42,
        query: { channel: "email", status: "delivered" },
      }),
      res,
    );

    expect(listCommunicationsMessages).toHaveBeenCalledWith(42, {
      channel: "email",
      status: "delivered",
      customerId: null,
      followUpId: null,
      from: undefined,
      to: undefined,
      page: 1,
      limit: 20,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: result.messages,
      pagination: result.pagination,
    }));
  });

  it("returns a safe error when message history retrieval fails", async () => {
    listCommunicationsMessages.mockRejectedValue(new Error("Database details"));

    const res = createResponse();

    await listCommunicationsMessagesController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: "Something went wrong while retrieving communication history.",
    }));
  });

  it("rejects an invalid message ID", async () => {
    const res = createResponse();

    await getCommunicationsMessageController(
      createRequest({ params: { id: "abc" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getCommunicationsMessage).not.toHaveBeenCalled();
  });

  it("retrieves a message using the authenticated business ID", async () => {
    const message = { id: 12, status: "delivered", attempts: [] };
    getCommunicationsMessage.mockResolvedValue(message);

    const res = createResponse();

    await getCommunicationsMessageController(
      createRequest({ businessId: 42, params: { id: "12" } }),
      res,
    );

    expect(getCommunicationsMessage).toHaveBeenCalledWith(42, 12);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: message,
    }));
  });

  it("returns 404 when a message is not found", async () => {
    getCommunicationsMessage.mockResolvedValue(null);

    const res = createResponse();

    await getCommunicationsMessageController(
      createRequest({ params: { id: "999" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns the communications overview for the authenticated business", async () => {
    const overview = {
      totals: { total: 5, delivered: 4, failed: 1 },
      byChannel: {},
      deliveryRate: 80,
    };

    getCommunicationsOverview.mockResolvedValue(overview);

    const res = createResponse();

    await getCommunicationsOverviewController(
      createRequest({ businessId: 42 }),
      res,
    );

    expect(getCommunicationsOverview).toHaveBeenCalledWith(42);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: overview,
    }));
  });
});
