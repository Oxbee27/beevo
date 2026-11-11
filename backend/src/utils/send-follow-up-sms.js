function providerError(message, deliveryOutcome) {
  const error = new Error(message);
  error.deliveryOutcome = deliveryOutcome;
  return error;
}

export async function sendFollowUpSms({
  to,
  body,
  fetchImpl = fetch,
  env = process.env,
} = {}) {
  const apiKey = env.TERMII_API_KEY;
  const senderId = env.TERMII_SENDER_ID;
  const baseUrl = env.TERMII_BASE_URL;
  const channel = env.TERMII_SMS_CHANNEL;

  if (!apiKey || !senderId || !baseUrl || !channel) {
    throw providerError(
      "Termii SMS configuration is incomplete.",
      "rejected",
    );
  }

  if (!["generic", "dnd"].includes(channel)) {
    throw providerError(
      "Termii SMS channel must be generic or dnd.",
      "rejected",
    );
  }

  if (!/^[A-Za-z0-9]{3,11}$/.test(senderId)) {
    throw providerError(
      "The configured Termii sender ID is invalid.",
      "rejected",
    );
  }

  if (
    typeof to !== "string" ||
    !/^\+[1-9]\d{7,14}$/.test(to) ||
    typeof body !== "string" ||
    !body.trim()
  ) {
    throw providerError(
      "The SMS recipient or message content is invalid.",
      "rejected",
    );
  }

  let endpoint;

  try {
    const parsedBaseUrl = new URL(baseUrl);

    if (parsedBaseUrl.protocol !== "https:") {
      throw new Error("HTTPS is required.");
    }

    endpoint = `${baseUrl.replace(/\/+$/, "")}/api/sms/send`;
  } catch {
    throw providerError(
      "The configured Termii base URL is invalid.",
      "rejected",
    );
  }

  let response;

  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        to: to.slice(1),
        from: senderId,
        sms: body,
        type: "plain",
        channel,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw providerError(
      "Termii's SMS delivery outcome could not be confirmed.",
      "unknown",
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : "Termii rejected the SMS request.";

    if (response.status === 408 || response.status >= 500) {
      throw providerError(
        "Termii's SMS delivery outcome could not be confirmed.",
        "unknown",
      );
    }

    throw providerError(message, "rejected");
  }

  const providerMessageId =
    data?.message_id_str ?? data?.message_id;

  if (
    typeof providerMessageId !== "string" &&
    typeof providerMessageId !== "number"
  ) {
    throw providerError(
      "Termii responded without a verifiable message reference.",
      "unknown",
    );
  }

  return {
    provider: "termii",
    providerMessageId: String(providerMessageId),
  };
}
