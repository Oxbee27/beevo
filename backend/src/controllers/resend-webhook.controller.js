import { Resend } from "resend";
import { processResendWebhookEvent } from "../services/process-resend-webhook.service.js";

const verifier = new Resend(
  process.env.RESEND_API_KEY || "re_webhook_verification_only",
);

export async function handleResendWebhook(req, res, next) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(503).json({
      success: false,
      message: "Webhook verification is not configured.",
    });
  }

  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook request body.",
    });
  }

  const headers = {
    id: req.get("svix-id"),
    timestamp: req.get("svix-timestamp"),
    signature: req.get("svix-signature"),
  };

  if (!headers.id || !headers.timestamp || !headers.signature) {
    return res.status(400).json({
      success: false,
      message: "Webhook signature headers are missing.",
    });
  }

  let event;

  try {
    event = verifier.webhooks.verify({
      payload: req.body.toString("utf8"),
      headers,
      webhookSecret,
    });
  } catch {
    return res.status(400).json({
      success: false,
      message: "Webhook signature verification failed.",
    });
  }

  try {
    const result = await processResendWebhookEvent({
      eventId: headers.id,
      event,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}
