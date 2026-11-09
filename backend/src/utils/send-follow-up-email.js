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

export async function sendFollowUpEmail({ to, subject, body }) {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL } = process.env;

  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    throw new Error("The email delivery service is not configured.");
  }

  const resend = new Resend(RESEND_API_KEY);

  const safeBody = escapeHtml(body).replace(/\r?\n/g, "<br>");

  const { data, error } = await resend.emails.send({
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

  if (error) {
    const deliveryError = new Error("Beevo could not deliver the email.");
    deliveryError.cause = error;
    throw deliveryError;
  }

  if (!data?.id) {
    throw new Error("The email provider did not return a message ID.");
  }

  return {
    provider: "resend",
    providerMessageId: data.id,
  };
}
