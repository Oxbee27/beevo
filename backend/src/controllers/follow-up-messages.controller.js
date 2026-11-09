import {
  followUpMessageIdSchema,
  scheduleFollowUpMessageSchema,
} from "../validators/follow-up-message.validator.js";
import { scheduleFollowUpMessage } from "../services/schedule-follow-up-message.service.js";
import { listFollowUpMessages } from "../services/list-follow-up-messages.service.js";
import { cancelFollowUpMessage } from "../services/cancel-follow-up-message.service.js";

function parsePositiveId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function scheduleFollowUpMessageController(req, res) {
  const followUpId = parsePositiveId(req.params.id);

  if (!followUpId) {
    return res.status(400).json({
      success: false,
      message: "Invalid follow-up ID.",
    });
  }

  const validation = scheduleFollowUpMessageSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid message details.",
      errors: validation.error.issues,
    });
  }

  try {
    const result = await scheduleFollowUpMessage(
      req.user.businessId,
      followUpId,
      validation.data,
    );

    return res.status(result.alreadyScheduled ? 200 : 201).json({
      success: true,
      message: result.alreadyScheduled
        ? "This message was already scheduled."
        : "Customer message scheduled successfully.",
      data: result.message,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : "Something went wrong while scheduling the message.",
    });
  }
}

export async function listFollowUpMessagesController(req, res) {
  const followUpId = parsePositiveId(req.params.id);

  if (!followUpId) {
    return res.status(400).json({
      success: false,
      message: "Invalid follow-up ID.",
    });
  }

  try {
    const messages = await listFollowUpMessages(
      req.user.businessId,
      followUpId,
    );

    if (messages === null) {
      return res.status(404).json({
        success: false,
        message: "Follow-up not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Follow-up messages retrieved successfully.",
      data: messages,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Something went wrong while retrieving follow-up messages.",
    });
  }
}

export async function cancelFollowUpMessageController(req, res) {
  const validation = followUpMessageIdSchema.safeParse(req.params.messageId);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid message ID.",
    });
  }

  try {
    const result = await cancelFollowUpMessage(
      req.user.businessId,
      validation.data,
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
        message: "Only pending messages can be cancelled.",
        data: result.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Scheduled message cancelled successfully.",
      data: result.message,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Something went wrong while cancelling the message.",
    });
  }
}
