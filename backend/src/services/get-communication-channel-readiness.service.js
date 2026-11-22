import { resolveBusinessWhatsAppCredentials } from "./resolve-business-whatsapp-credentials.service.js";

const CHANNEL_REQUIREMENTS = {
  email: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
  sms: ["TERMII_API_KEY", "TERMII_BASE_URL", "TERMII_SMS_CHANNEL"],
};

function getChannelStatus(requiredVariables) {
  const missing = requiredVariables.filter(
    (variable) => !process.env[variable]?.trim(),
  );

  return {
    configured: missing.length === 0,
    status: missing.length === 0 ? "configured" : "not_configured",
    missing,
  };
}

function getWhatsAppReadinessStatus(resolution) {
  if (resolution?.status === "ready" && resolution.credentials) {
    return { configured: true, status: "configured", missing: [] };
  }

  const missingByStatus = {
    not_connected: ["CONNECTED_WHATSAPP_BUSINESS_ACCOUNT"],
    ambiguous: ["A_SINGLE_ACTIVE_WHATSAPP_CONNECTION"],
    credentials_unavailable: ["VALID_WHATSAPP_CONNECTION_CREDENTIALS"],
  };

  return {
    configured: false,
    status: "not_configured",
    missing: missingByStatus[resolution?.status] ?? [
      "CONNECTED_WHATSAPP_BUSINESS_ACCOUNT",
    ],
  };
}

export async function getCommunicationChannelReadiness({
  businessId,
  resolveWhatsAppCredentials = resolveBusinessWhatsAppCredentials,
} = {}) {
  let whatsappResolution = null;

  if (Number.isSafeInteger(Number(businessId)) && Number(businessId) > 0) {
    whatsappResolution = await resolveWhatsAppCredentials({
      businessId: Number(businessId),
    });
  }

  return {
    channels: {
      ...Object.fromEntries(
        Object.entries(CHANNEL_REQUIREMENTS).map(([channel, variables]) => [
          channel,
          getChannelStatus(variables),
        ]),
      ),
      whatsapp: getWhatsAppReadinessStatus(whatsappResolution),
    },
    webhooks: {
      resend: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
      termii: Boolean(process.env.TERMII_WEBHOOK_SECRET?.trim()),
      whatsapp: Boolean(
        process.env.WHATSAPP_APP_SECRET?.trim() &&
        process.env.WHATSAPP_VERIFY_TOKEN?.trim()
      ),
    },
  };
}
