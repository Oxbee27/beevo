import { Resend } from "resend";

export async function sendPasswordResetEmail(email, token) {
  const {
    RESEND_API_KEY,
    RESEND_FROM_EMAIL,
    FRONTEND_URL,
  } = process.env;

  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL || !FRONTEND_URL) {
    throw new Error("Password reset email service is not configured.");
  }

  const resend = new Resend(RESEND_API_KEY);

  const resetUrl = new URL("/reset-password", FRONTEND_URL);
  resetUrl.searchParams.set("token", token);

  const { data, error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: [email],
    subject: "Reset your Beevo password",
    text: [
      "We received a request to reset your Beevo password.",
      "",
      `Use this link to choose a new password: ${resetUrl.toString()}`,
      "",
      "This link expires in 30 minutes and can only be used once.",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;line-height:1.6">
        <h2>Reset your Beevo password</h2>
        <p>We received a request to reset your Beevo password.</p>
        <p>
          <a href="${resetUrl.toString()}"
             style="display:inline-block;padding:12px 20px;background:#222;color:#fff;text-decoration:none;border-radius:6px">
            Reset password
          </a>
        </p>
        <p>This link expires in 30 minutes and can only be used once.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    const deliveryError = new Error("Beevo could not send the password reset email.");
    deliveryError.cause = error;
    throw deliveryError;
  }

  return data;
}
