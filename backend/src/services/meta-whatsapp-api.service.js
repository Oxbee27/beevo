const GRAPH_API_BASE_URL = "https://graph.facebook.com";
const DEFAULT_GRAPH_API_VERSION = "v27.0";

function getMetaConfiguration(env = process.env) {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim();
  const graphApiVersion = (
    env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION
  ).trim();

  if (!appId || !appSecret) {
    throw new Error("Meta WhatsApp integration is not configured.");
  }

  if (!/^\d+$/.test(appId)) {
    throw new Error("Meta App ID configuration is invalid.");
  }

  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    throw new Error("Meta Graph API version configuration is invalid.");
  }

  return { appId, appSecret, graphApiVersion };
}

function validateMetaId(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{1,40}$/.test(value)
  ) {
    throw new Error(`A valid Meta ${label} is required.`);
  }
}

async function readMetaResponse(response) {
  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new Error("Meta returned an invalid response.");
  }

  if (!response.ok || payload?.error) {
    throw new Error("Meta rejected the WhatsApp integration request.");
  }

  return payload;
}

async function requestMetaJson(url, accessToken, fetchImpl) {
  let response;

  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Meta could not be reached. Please try again.");
  }

  return readMetaResponse(response);
}

export async function exchangeMetaAuthorizationCode({
  code,
  fetchImpl = globalThis.fetch,
  env = process.env,
}) {
  if (
    typeof code !== "string" ||
    code.trim().length === 0 ||
    code.length > 4096
  ) {
    throw new Error("A valid Meta authorization code is required.");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("Meta API networking is unavailable.");
  }

  const { appId, appSecret, graphApiVersion } =
    getMetaConfiguration(env);

  const url = new URL(
    `${GRAPH_API_BASE_URL}/${graphApiVersion}/oauth/access_token`,
  );

  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);

  let response;

  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Meta could not be reached. Please try again.");
  }

  const payload = await readMetaResponse(response);

  if (
    typeof payload.access_token !== "string" ||
    payload.access_token.trim().length === 0
  ) {
    throw new Error("Meta did not return a valid access token.");
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type || null,
    expiresIn: Number.isSafeInteger(payload.expires_in)
      ? payload.expires_in
      : null,
  };
}

export async function verifyMetaWhatsAppAssets({
  accessToken,
  businessAccountId,
  phoneNumberId,
  fetchImpl = globalThis.fetch,
  env = process.env,
}) {
  if (
    typeof accessToken !== "string" ||
    accessToken.trim().length === 0
  ) {
    throw new Error("A valid Meta access token is required.");
  }

  validateMetaId(businessAccountId, "WhatsApp Business Account ID");
  validateMetaId(phoneNumberId, "phone number ID");

  if (typeof fetchImpl !== "function") {
    throw new Error("Meta API networking is unavailable.");
  }

  const { graphApiVersion } = getMetaConfiguration(env);
  const baseUrl = `${GRAPH_API_BASE_URL}/${graphApiVersion}`;

  const accountUrl = new URL(
    `${baseUrl}/${businessAccountId}`,
  );
  accountUrl.searchParams.set("fields", "id,name");

  const account = await requestMetaJson(
    accountUrl,
    accessToken,
    fetchImpl,
  );

  if (String(account.id) !== businessAccountId) {
    throw new Error("Meta WhatsApp Business Account could not be verified.");
  }

  const phoneNumbersUrl = new URL(
    `${baseUrl}/${businessAccountId}/phone_numbers`,
  );
  phoneNumbersUrl.searchParams.set(
    "fields",
    "id,display_phone_number,verified_name",
  );
  phoneNumbersUrl.searchParams.set("limit", "100");

  const phoneNumbers = await requestMetaJson(
    phoneNumbersUrl,
    accessToken,
    fetchImpl,
  );

  if (!Array.isArray(phoneNumbers.data)) {
    throw new Error("Meta did not return a valid phone number list.");
  }

  const phone = phoneNumbers.data.find(
    (item) => String(item.id) === phoneNumberId,
  );

  if (!phone) {
    throw new Error(
      "The selected phone number does not belong to the verified WhatsApp Business Account.",
    );
  }

  if (
    typeof phone.display_phone_number !== "string" ||
    phone.display_phone_number.trim().length === 0
  ) {
    throw new Error("Meta did not return a valid business phone number.");
  }

  return {
    businessAccountId,
    businessAccountName:
      typeof account.name === "string" ? account.name : null,
    phoneNumberId,
    displayNumber: phone.display_phone_number,
    verifiedName:
      typeof phone.verified_name === "string"
        ? phone.verified_name
        : null,
  };
}

async function requestMetaPost(url, accessToken, parameters, fetchImpl) {
  let response;

  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
      },
      body: parameters.toString(),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Meta could not be reached. Please try again.");
  }

  return readMetaResponse(response);
}

export async function subscribeMetaWhatsAppAppToWaba({
  accessToken,
  businessAccountId,
  fetchImpl = globalThis.fetch,
  env = process.env,
}) {
  if (
    typeof accessToken !== "string" ||
    accessToken.trim().length === 0
  ) {
    throw new Error("A valid Meta access token is required.");
  }

  validateMetaId(businessAccountId, "WhatsApp Business Account ID");

  if (typeof fetchImpl !== "function") {
    throw new Error("Meta API networking is unavailable.");
  }

  const { graphApiVersion } = getMetaConfiguration(env);
  const url = new URL(
    `${GRAPH_API_BASE_URL}/${graphApiVersion}/${businessAccountId}/subscribed_apps`,
  );

  await requestMetaPost(
    url,
    accessToken,
    new URLSearchParams(),
    fetchImpl,
  );

  return { subscribed: true };
}

export async function registerMetaWhatsAppPhoneNumber({
  accessToken,
  phoneNumberId,
  pin,
  fetchImpl = globalThis.fetch,
  env = process.env,
}) {
  if (
    typeof accessToken !== "string" ||
    accessToken.trim().length === 0
  ) {
    throw new Error("A valid Meta access token is required.");
  }

  validateMetaId(phoneNumberId, "phone number ID");

  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
    throw new Error("The WhatsApp registration PIN must contain exactly six digits.");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("Meta API networking is unavailable.");
  }

  const { graphApiVersion } = getMetaConfiguration(env);
  const url = new URL(
    `${GRAPH_API_BASE_URL}/${graphApiVersion}/${phoneNumberId}/register`,
  );

  const parameters = new URLSearchParams({
    messaging_product: "whatsapp",
    pin,
  });

  await requestMetaPost(url, accessToken, parameters, fetchImpl);

  return { registered: true };
}
