import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { processTermiiWebhookEvent } from "../services/process-termii-webhook.service.js";

function verifyTermiiSignature(rawBody, signature, secret) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !/^[a-fA-F0-9]{128}$/.test(signature) ||
    typeof secret !== "string" ||
    !secret
  ) {
    return false;
  }

  const expected = createHmac("sha512", secret)
    .update(rawBody)
    .digest();

  const supplied = Buffer.from(signature, "hex");

  return supplied.length === expected.length &&
    timingSafeEqual(supplied, expected);
}

export async function handleTermiiWebhook(req, res, next) {
  const secret = process.env.TERMII_WEBHOOK_SECRET;

  if (!secret) {
    return res.status(503).json({
      success: false,
      message: "SMS webhook verification is not configured.",
    });
  }

  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook request body.",
    });
  }

  const signature = req.get("X-Termii-Signature");

  if (!verifyTermiiSignature(req.body, signature, secret)) {
    return res.status(400).json({
      success: false,
      message: "Webhook signature verification failed.",
    });
  }

  let event;

  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook event payload.",
    });
  }

  try {
    const eventFingerprint = createHash("sha256")
      .update(req.body)
      .digest("hex");

    const result = await processTermiiWebhookEvent({
      eventFingerprint,
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
