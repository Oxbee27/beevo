import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import {
  processWhatsAppWebhookEvent,
} from "../services/process-whatsapp-webhook.service.js";

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;

  const a = Buffer.from(left);
  const b = Buffer.from(right);

  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyWhatsAppWebhook(req, res) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    return res.status(500).send("WhatsApp webhook verification is not configured.");
  }

  const mode = req.query["hub.mode"];
  const suppliedToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode !== "subscribe" ||
    !safeEqual(suppliedToken, verifyToken) ||
    typeof challenge !== "string"
  ) {
    return res.status(403).send("WhatsApp webhook verification failed.");
  }

  return res.status(200).type("text/plain").send(challenge);
}

export function isValidWhatsAppSignature(rawBody, signature, appSecret) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    typeof appSecret !== "string" ||
    !appSecret
  ) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;

  return safeEqual(signature, expected);
}

export async function handleWhatsAppWebhook(req, res) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    return res.status(500).json({
      success: false,
      message: "WhatsApp webhook security is not configured.",
    });
  }

  if (
    !isValidWhatsAppSignature(
      req.body,
      req.get("x-hub-signature-256"),
      appSecret,
    )
  ) {
    return res.status(401).json({
      success: false,
      message: "WhatsApp webhook signature is invalid.",
    });
  }

  let payload;

  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({
      success: false,
      message: "WhatsApp webhook payload is invalid.",
    });
  }

  if (!payload || !Array.isArray(payload.entry)) {
    return res.status(400).json({
      success: false,
      message: "WhatsApp webhook event structure is invalid.",
    });
  }

  try {
    const results = [];

    for (const entry of payload.entry) {
      for (const change of entry?.changes || []) {
        const statuses = change?.value?.statuses;

        if (!Array.isArray(statuses)) continue;

        for (const status of statuses) {
          const fingerprint = createHash("sha256")
            .update(JSON.stringify(status))
            .digest("hex");

          const result = await processWhatsAppWebhookEvent({
            eventFingerprint: fingerprint,
            event: status,
          });

          results.push(result.status);
        }
      }
    }

    return res.status(200).json({
      success: true,
      processed: results.length,
    });
  } catch (error) {
    console.error("WhatsApp webhook processing failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "WhatsApp webhook could not be processed.",
    });
  }
}
