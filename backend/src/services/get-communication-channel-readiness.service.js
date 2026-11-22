const CHANNEL_REQUIREMENTS = {
  email: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
  sms: [
    "TERMII_API_KEY",
    "TERMII_BASE_URL",
    "TERMII_SMS_CHANNEL",
  ],
  whatsapp: [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_API_VERSION",
  ],
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

export function getCommunicationChannelReadiness() {
  return {
    channels: Object.fromEntries(
      Object.entries(CHANNEL_REQUIREMENTS).map(([channel, variables]) => [
        channel,
        getChannelStatus(variables),
      ]),
    ),
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
