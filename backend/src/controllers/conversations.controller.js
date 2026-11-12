import {
  listBusinessConversations,
  getBusinessConversation,
} from "../services/list-business-conversations.service.js";

import {
  classifyBusinessConversation,
} from "../services/classify-business-conversation.service.js";

function positiveInteger(value) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0
    ? number
    : null;
}

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

export async function listConversationsController(req, res) {
  const page = req.query.page === undefined ? 1 : positiveInteger(req.query.page);
  const limit = req.query.limit === undefined ? 20 : positiveInteger(req.query.limit);

  if (!page || !limit || limit > 100) {
    return sendError(res, 400, "Please provide valid pagination details.");
  }

  const offset = (page - 1) * limit;

  if (!Number.isSafeInteger(offset)) {
    return sendError(res, 400, "Please provide valid pagination details.");
  }

  const { status, classification, channel, assignedTo, search } = req.query;

  if (
    status && !["open", "pending", "resolved"].includes(status)
  ) {
    return sendError(res, 400, "Please select a valid conversation status.");
  }

  if (
    classification &&
    !["unclassified", "business", "excluded"].includes(classification)
  ) {
    return sendError(res, 400, "Please select a valid classification.");
  }

  if (channel && !["email", "sms", "whatsapp"].includes(channel)) {
    return sendError(res, 400, "Please select a valid communication channel.");
  }

  if (
    assignedTo &&
    assignedTo !== "unassigned" &&
    !positiveInteger(assignedTo)
  ) {
    return sendError(res, 400, "Please provide a valid staff member.");
  }

  try {
    const result = await listBusinessConversations(req.user.businessId, {
      page,
      limit,
      status,
      classification,
      channel,
      assignedTo,
      search: typeof search === "string" ? search.trim() : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "We couldn't load your conversations. Please try again.",
    );
  }
}

export async function getConversationController(req, res) {
  const conversationId = positiveInteger(req.params.id);

  if (!conversationId) {
    return sendError(res, 400, "Please provide a valid conversation ID.");
  }

  try {
    const result = await getBusinessConversation(
      req.user.businessId,
      conversationId,
    );

    if (!result) {
      return sendError(res, 404, "We couldn't find that conversation.");
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "We couldn't load that conversation. Please try again.",
    );
  }
}

export async function classifyConversationController(req, res) {
  const conversationId = positiveInteger(req.params.id);
  const body = req.body || {};
  const { classification } = body;
  const customerIdProvided = Object.prototype.hasOwnProperty.call(body, "customerId");

  let customerId = null;

  if (
    !conversationId ||
    !["business", "excluded"].includes(classification)
  ) {
    return sendError(res, 400, "Please provide a valid conversation classification.");
  }

  if (body.customerId !== undefined && body.customerId !== null) {
    customerId = positiveInteger(body.customerId);

    if (!customerId) {
      return sendError(res, 400, "Please provide a valid customer ID.");
    }
  }

  if (classification === "excluded" && customerId !== null) {
    return sendError(
      res,
      400,
      "Excluded conversations cannot be linked to a customer.",
    );
  }

  try {
    const result = await classifyBusinessConversation({
      businessId: req.user.businessId,
      conversationId,
      classification,
      customerId,
      preserveCustomer: classification === "business" && !customerIdProvided,
      userId: req.user.id,
    });

    if (result.conflict) {
      const notFound = result.reason === "Conversation not found.";

      return sendError(
        res,
        notFound ? 404 : 409,
        result.reason,
      );
    }

    return res.status(200).json({
      success: true,
      message: "Conversation classification updated.",
      data: result.conversation,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "We couldn't update the conversation. Please try again.",
    );
  }
}
