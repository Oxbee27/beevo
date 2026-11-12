import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listBusinessConversations,
  getBusinessConversation,
  classifyBusinessConversation,
} = vi.hoisted(() => ({
  listBusinessConversations: vi.fn(),
  getBusinessConversation: vi.fn(),
  classifyBusinessConversation: vi.fn(),
}));

vi.mock("../src/services/list-business-conversations.service.js", () => ({
  listBusinessConversations,
  getBusinessConversation,
}));

vi.mock("../src/services/classify-business-conversation.service.js", () => ({
  classifyBusinessConversation,
}));

import {
  listConversationsController,
  getConversationController,
  classifyConversationController,
} from "../src/controllers/conversations.controller.js";

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("Beevo conversation controllers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists conversations within the authenticated business", async () => {
    listBusinessConversations.mockResolvedValue({
      conversations: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const req = {
      user: { businessId: 7 },
      query: {},
    };
    const res = createResponse();

    await listConversationsController(req, res);

    expect(listBusinessConversations).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ page: 1, limit: 20 })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects invalid pagination", async () => {
    const req = {
      user: { businessId: 7 },
      query: { page: "invalid" },
    };
    const res = createResponse();

    await listConversationsController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(listBusinessConversations).not.toHaveBeenCalled();
  });

  it("rejects pagination when the calculated offset exceeds the safe integer range", async () => {
    const req = {
      user: { businessId: 7 },
      query: {
        page: "9007199254740991",
        limit: "100",
      },
    };
    const res = createResponse();

    await listConversationsController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Please provide valid pagination details.",
    });
    expect(listBusinessConversations).not.toHaveBeenCalled();
  });

  it("returns 404 for a conversation not found in the business", async () => {
    getBusinessConversation.mockResolvedValue(null);

    const req = {
      user: { businessId: 7 },
      params: { id: "20" },
    };
    const res = createResponse();

    await getConversationController(req, res);

    expect(getBusinessConversation).toHaveBeenCalledWith(7, 20);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("classifies a conversation as a business conversation", async () => {
    classifyBusinessConversation.mockResolvedValue({
      conflict: false,
      conversation: {
        id: 20,
        classification_status: "business",
      },
    });

    const req = {
      user: { businessId: 7, id: 4 },
      params: { id: "20" },
      body: { classification: "business", customerId: 6 },
    };
    const res = createResponse();

    await classifyConversationController(req, res);

    expect(classifyBusinessConversation).toHaveBeenCalledWith({
      businessId: 7,
      conversationId: 20,
      classification: "business",
      customerId: 6,
      preserveCustomer: false,
      userId: 4,
    });

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("preserves an existing customer link when customerId is omitted", async () => {
    const req = {
      user: { businessId: 7, id: 4 },
      params: { id: "20" },
      body: { classification: "business" },
    };
    const res = createResponse();

    await classifyConversationController(req, res);

    expect(classifyBusinessConversation).toHaveBeenCalledWith({
      businessId: 7,
      conversationId: 20,
      classification: "business",
      customerId: null,
      preserveCustomer: true,
      userId: 4,
    });
  });

  it("allows an existing customer link to be cleared explicitly", async () => {
    const req = {
      user: { businessId: 7, id: 4 },
      params: { id: "20" },
      body: { classification: "business", customerId: null },
    };
    const res = createResponse();

    await classifyConversationController(req, res);

    expect(classifyBusinessConversation).toHaveBeenCalledWith({
      businessId: 7,
      conversationId: 20,
      classification: "business",
      customerId: null,
      preserveCustomer: false,
      userId: 4,
    });
  });

  it("rejects invalid customer IDs", async () => {
    const req = {
      user: { businessId: 7, id: 4 },
      params: { id: "20" },
      body: { classification: "business", customerId: "invalid" },
    };
    const res = createResponse();

    await classifyConversationController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(classifyBusinessConversation).not.toHaveBeenCalled();
  });

  it("returns conflict when classification is rejected", async () => {
    classifyBusinessConversation.mockResolvedValue({
      conflict: true,
      reason: "The selected customer does not belong to this business.",
    });

    const req = {
      user: { businessId: 7, id: 4 },
      params: { id: "20" },
      body: { classification: "business", customerId: 99 },
    };
    const res = createResponse();

    await classifyConversationController(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("rejects a missing request body", async () => {
    const req = {
      user: { businessId: 7, id: 4 },
      params: { id: "20" },
    };
    const res = createResponse();

    await classifyConversationController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(classifyBusinessConversation).not.toHaveBeenCalled();
  });

  it("does not allow an invalid classification", async () => {
    const req = {
      user: { businessId: 7, id: 4 },
      params: { id: "20" },
      body: { classification: "personal" },
    };
    const res = createResponse();

    await classifyConversationController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(classifyBusinessConversation).not.toHaveBeenCalled();
  });
});
