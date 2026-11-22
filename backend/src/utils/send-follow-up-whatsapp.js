function whatsappError(message, deliveryOutcome) {
  const error = new Error(message);
  error.deliveryOutcome = deliveryOutcome;
  return error;
}

function getConfig({ accessToken, phoneNumberId }) {
  const apiVersion = process.env.WHATSAPP_API_VERSION;

  if (
    typeof accessToken !== "string" ||
    !accessToken.trim() ||
    typeof phoneNumberId !== "string" ||
    !/^\d+$/.test(phoneNumberId) ||
    typeof apiVersion !== "string" ||
    !/^v\d+\.\d+$/.test(apiVersion)
  ) {
    throw whatsappError(
      "The business WhatsApp connection is not fully configured.",
      "rejected",
    );
  }

  return { accessToken, phoneNumberId, apiVersion };
}

export async function sendFollowUpWhatsApp({
  to,
  templateName,
  languageCode = "en",
  components = [],
  accessToken,
  phoneNumberId,
}) {
  const config = getConfig({ accessToken, phoneNumberId });

  if (typeof to !== "string" || !/^\+[1-9]\d{7,14}$/.test(to)) {
    throw whatsappError("WhatsApp recipient must use E.164 format.", "rejected");
  }

  if (
    typeof templateName !== "string" ||
    !/^[a-z0-9_]+$/.test(templateName)
  ) {
    throw whatsappError("A valid approved WhatsApp template name is required.", "rejected");
  }

  if (
    typeof languageCode !== "string" ||
    !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(languageCode)
  ) {
    throw whatsappError("WhatsApp template language code is invalid.", "rejected");
  }

  if (!Array.isArray(components)) {
    throw whatsappError("WhatsApp template components must be an array.", "rejected");
  }

  const url =
    `https://graph.facebook.com/${config.apiVersion}/` +
    `${config.phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.slice(1),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw whatsappError(
      "WhatsApp request outcome could not be confirmed.",
      "unknown",
    );
  }

  let result;

  try {
    result = await response.json();
  } catch {
    throw whatsappError(
      "WhatsApp returned an unreadable response.",
      response.ok ? "unknown" : "unknown",
    );
  }

  if (!response.ok) {
    const message =
      result?.error?.message || "WhatsApp rejected the message request.";

    throw whatsappError(
      message,
      response.status >= 500 || response.status === 408
        ? "unknown"
        : "rejected",
    );
  }

  const providerMessageId = result?.messages?.[0]?.id;

  if (
    typeof providerMessageId !== "string" ||
    !providerMessageId.startsWith("wamid.")
  ) {
    throw whatsappError(
      "WhatsApp accepted the request without returning a valid message ID.",
      "unknown",
    );
  }

  return {
    provider: "meta_whatsapp",
    providerMessageId,
  };
}
