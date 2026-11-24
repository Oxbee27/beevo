import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import {
  processWhatsAppWebhookEvent,
} from "../services/process-whatsapp-webhook.service.js";
import {
  processWhatsAppInboundMessage,
} from "../services/process-whatsapp-inbound-message.service.js";
import { processMetaWhatsAppAccountEvent } from "../services/process-meta-whatsapp-account-event.service.js";

const META_ACCOUNT_EVENT_FIELDS = new Set([
  "account_update",
  "account_review_update",
  "phone_number_quality_update",
  "phone_number_name_update",
]);

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

function extractInboundBody(message) {
  switch (message?.type) {
    case "text":
      return message.text?.body ?? null;

    case "button":
      return message.button?.text ?? null;

    case "interactive":
      return (
        message.interactive?.button_reply?.title ??
        message.interactive?.list_reply?.title ??
        null
      );

    case "image":
    case "document":
    case "video":
      return message[message.type]?.caption ?? null;

    case "location":
      return (
        message.location?.name ??
        message.location?.address ??
        null
      );

    default:
      return null;
  }
}

function extractReceivedAt(timestamp) {
  if (timestamp === undefined || timestamp === null) return undefined;

  const seconds = Number(timestamp);

  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;

  const date = new Date(seconds * 1000);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function processInboundMessages(value) {
  const messages = value?.messages;
  if (!Array.isArray(messages)) return 0;

  const phoneNumberId = value?.metadata?.phone_number_id;
  const contacts = Array.isArray(value?.contacts) ? value.contacts : [];

  const contactsByWaId = new Map(
    contacts
      .filter((contact) => contact?.wa_id)
      .map((contact) => [
        String(contact.wa_id),
        contact.profile?.name ?? null,
      ]),
  );

  let processed = 0;

  for (const message of messages) {
    await processWhatsAppInboundMessage({
      phoneNumberId,
      contactIdentifier: message?.from,
      contactDisplayName: contactsByWaId.get(String(message?.from)) ?? null,
      providerMessageId: message?.id,
      messageType: message?.type,
      body: extractInboundBody(message),
      receivedAt: extractReceivedAt(message?.timestamp),
    });

    processed += 1;
  }

  return processed;
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
    let statusesProcessed = 0;
    let inboundProcessed = 0;
    let accountEventsProcessed = 0;

    for (const entry of payload.entry) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change?.value;

        if (META_ACCOUNT_EVENT_FIELDS.has(change?.field)) {
          const eventFingerprint = createHash("sha256")
            .update(JSON.stringify({
              entryId: entry?.id ?? null,
              field: change.field,
              value,
            }))
            .digest("hex");

          await processMetaWhatsAppAccountEvent({
            eventFingerprint,
            field: change.field,
            externalAccountId: entry?.id,
            phoneNumberId: value?.metadata?.phone_number_id,
            event: value,
          });

          accountEventsProcessed += 1;
        }

        if (Array.isArray(value?.statuses)) {
          for (const status of value.statuses) {
            const fingerprint = createHash("sha256")
              .update(JSON.stringify(status))
              .digest("hex");

            await processWhatsAppWebhookEvent({
              eventFingerprint: fingerprint,
              event: status,
            });

            statusesProcessed += 1;
          }
        }

        inboundProcessed += await processInboundMessages(value);
      }
    }

    return res.status(200).json({
      success: true,
      processed: statusesProcessed + inboundProcessed + accountEventsProcessed,
      statusesProcessed,
      inboundProcessed,
      accountEventsProcessed,
    });
  } catch (error) {
    console.error("WhatsApp webhook processing failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "WhatsApp webhook could not be processed.",
    });
  }
}
