import {
  listBusinessConversations,
  getBusinessConversation,
} from "../services/list-business-conversations.service.js";

import {
  classifyBusinessConversation,
} from "../services/classify-business-conversation.service.js";
import {
  sendBusinessConversationReply,
} from "../services/send-business-conversation-reply.service.js";

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

import {
  listPendingConversations,
  getPendingConversation,
} from "../services/pending-conversation-inbox.service.js";

export async function listPendingConversationsController(req, res) {
  const page = req.query.page === undefined ? 1 : positiveInteger(req.query.page);
  const limit = req.query.limit === undefined ? 20 : positiveInteger(req.query.limit);

  if (!page || !limit || limit > 100) {
    return sendError(res, 400, "Please provide valid pagination details.");
  }

  try {
    const result = await listPendingConversations(req.user.businessId, {
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch {
    return sendError(
      res,
      500,
      "We couldn't load messages awaiting review. Please try again.",
    );
  }
}

export async function getPendingConversationController(req, res) {
  const conversationId = positiveInteger(req.params.id);

  if (!conversationId) {
    return sendError(res, 400, "Please provide a valid conversation ID.");
  }

  try {
    const result = await getPendingConversation(
      req.user.businessId,
      conversationId,
    );

    if (!result) {
      return sendError(res, 404, "This pending conversation could not be found.");
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch {
    return sendError(
      res,
      500,
      "We couldn't load this pending conversation. Please try again.",
    );
  }
}


export async function sendConversationReplyController(req, res) {
  const conversationId = positiveInteger(req.params.id);
  const body = req.body || {};
  const messageBody = typeof body.body === "string" ? body.body.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const templateKey = typeof body.templateKey === "string"
    ? body.templateKey.trim()
    : "";
  const templateComponents = body.templateComponents === undefined
    ? []
    : body.templateComponents;
  const idempotencyKey = typeof body.idempotencyKey === "string"
    ? body.idempotencyKey.trim()
    : undefined;

  if (!conversationId) {
    return sendError(res, 400, "Please provide a valid conversation ID.");
  }

  if (messageBody.length > 5000) {
    return sendError(res, 400, "Your reply is too long. Please keep it under 5,000 characters.");
  }

  if (subject.length > 255 || templateKey.length > 100) {
    return sendError(res, 400, "Please check the email subject or template name.");
  }

  if (
    !Array.isArray(templateComponents) ||
    templateComponents.length > 1 ||
    templateComponents.some((component) =>
      !component ||
      component.type !== "body" ||
      !Array.isArray(component.parameters) ||
      component.parameters.length > 20 ||
      component.parameters.some((parameter) =>
        !parameter ||
        parameter.type !== "text" ||
        typeof parameter.text !== "string" ||
        !parameter.text.trim() ||
        parameter.text.length > 1024
      )
    )
  ) {
    return sendError(res, 400, "Please check the WhatsApp template values and try again.");
  }

  if (idempotencyKey && idempotencyKey.length > 150) {
    return sendError(res, 400, "Please submit the reply again.");
  }

  try {
    const result = await sendBusinessConversationReply({
      businessId: req.user.businessId,
      conversationId,
      userId: req.user.id,
      subject: subject || null,
      body: messageBody,
      templateKey: templateKey || null,
      templateComponents,
      idempotencyKey,
    });

    if (result.notFound) {
      return sendError(res, 404, "We couldn't find that conversation.");
    }

    return res.status(result.duplicate ? 200 : 202).json({
      success: true,
      message: result.duplicate
        ? "This reply has already been added to the delivery queue."
        : "Your reply has been added to the delivery queue.",
      data: result,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return sendError(res, 409, error.message);
    }

    console.error("Beevo could not queue a conversation reply:", error.message);
    return sendError(
      res,
      500,
      "We couldn't queue your reply. Please try again.",
    );
  }
}
