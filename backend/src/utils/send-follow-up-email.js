import { Resend } from "resend";

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function createDeliveryError(message, deliveryOutcome, cause) {
  const error = new Error(message);
  error.deliveryOutcome = deliveryOutcome;
  if (cause) error.cause = cause;
  return error;
}

export async function sendFollowUpEmail({ to, subject, body }) {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL } = process.env;

  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    throw createDeliveryError(
      "The email delivery service is not configured.",
      "rejected",
    );
  }

  const resend = new Resend(RESEND_API_KEY);
  const safeBody = escapeHtml(body).replace(/\r?\n/g, "<br>");

  let response;

  try {
    response = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject,
      text: body,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6">
          ${safeBody}
        </div>
      `,
    });
  } catch (cause) {
    throw createDeliveryError(
      "The email delivery outcome could not be confirmed.",
      "unknown",
      cause,
    );
  }

  const { data, error } = response || {};

  if (error) {
    const statusCode = Number(error.statusCode);
    const definiteRejection =
      Number.isInteger(statusCode) &&
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 408;

    throw createDeliveryError(
      definiteRejection
        ? "The email provider rejected the delivery request."
        : "The email delivery outcome could not be confirmed.",
      definiteRejection ? "rejected" : "unknown",
      error,
    );
  }

  if (!data?.id) {
    throw createDeliveryError(
      "The email provider did not return a message ID; delivery outcome is unknown.",
      "unknown",
    );
  }

  return { provider: "resend", providerMessageId: data.id };
}
