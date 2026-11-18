import {
  getCommunicationsMessage,
  getCommunicationsOverview,
  listCommunicationsMessages,
} from "../services/list-communications-messages.service.js";

import {
  getCommunicationChannelReadiness,
} from "../services/get-communication-channel-readiness.service.js";

import {
  retryCommunicationsMessage,
} from "../services/retry-communications-message.service.js";

const CHANNELS = new Set(["email", "sms", "whatsapp"]);
const STATUSES = new Set([
  "pending", "processing", "sent", "delivered",
  "failed", "cancelled", "unknown", "billing_blocked",
]);

function positiveInteger(value) {
  if (value === undefined) return null;

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function validDate(value) {
  return value === undefined ||
    (
      typeof value === "string" &&
      value.length > 0 &&
      !Number.isNaN(Date.parse(value))
    );
}

export function getCommunicationChannelsController(_req, res) {
  return res.status(200).json({
    success: true,
    message: "Communication channel readiness retrieved successfully.",
    data: getCommunicationChannelReadiness(),
  });
}

export async function listCommunicationsMessagesController(req, res) {
  const { channel, status, from, to } = req.query;
  const customerId = positiveInteger(req.query.customerId);
  const followUpId = positiveInteger(req.query.followUpId);
  const page = req.query.page === undefined
    ? 1
    : positiveInteger(req.query.page);
  const limit = req.query.limit === undefined
    ? 20
    : positiveInteger(req.query.limit);

  if (
    (channel !== undefined && !CHANNELS.has(channel)) ||
    (status !== undefined && !STATUSES.has(status)) ||
    (req.query.customerId !== undefined && !customerId) ||
    (req.query.followUpId !== undefined && !followUpId) ||
    !page ||
    !limit ||
    limit > 100 ||
    !validDate(from) ||
    !validDate(to) ||
    (from && to && new Date(from) > new Date(to))
  ) {
    return res.status(400).json({
      success: false,
      message: "One or more message history filters are invalid.",
    });
  }

  try {
    const result = await listCommunicationsMessages(
      req.user.businessId,
      { channel, status, customerId, followUpId, from, to, page, limit },
    );

    return res.status(200).json({
      success: true,
      message: "Communication history retrieved successfully.",
      data: result.messages,
      pagination: result.pagination,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Something went wrong while retrieving communication history.",
    });
  }
}

export async function getCommunicationsMessageController(req, res) {
  const messageId = positiveInteger(req.params.id);

  if (!messageId) {
    return res.status(400).json({
      success: false,
      message: "Invalid message ID.",
    });
  }

  try {
    const message = await getCommunicationsMessage(
      req.user.businessId,
      messageId,
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Communication message retrieved successfully.",
      data: message,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Something went wrong while retrieving the message.",
    });
  }
}

export async function getCommunicationsOverviewController(req, res) {
  try {
    const overview = await getCommunicationsOverview(req.user.businessId);

    return res.status(200).json({
      success: true,
      message: "Communication overview retrieved successfully.",
      data: overview,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Something went wrong while retrieving communication statistics.",
    });
  }
}

export async function retryCommunicationsMessageController(req, res) {
  const messageId = positiveInteger(req.params.id);

  if (!messageId) {
    return res.status(400).json({
      success: false,
      message: "Invalid message ID.",
    });
  }

  try {
    const result = await retryCommunicationsMessage(
      req.user.businessId,
      messageId,
    );

    if (!result.message) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    if (result.conflict) {
      return res.status(409).json({
        success: false,
        message: result.reason,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Message queued for another delivery attempt.",
      data: result.message,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Something went wrong while retrying the message.",
    });
  }
}
