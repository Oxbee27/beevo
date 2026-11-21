import { OAuth2Client } from "google-auth-library";
import pool from "../config/database.js";

const googleClient = new OAuth2Client();

function createAuthError(message, status = 401) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

export async function googleLoginUser(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();

  if (!clientId) {
    throw createAuthError(
      "Google sign-in is not configured yet. Please use your email and password.",
      503
    );
  }

  let payload;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });

    payload = ticket.getPayload();
  } catch {
    throw createAuthError(
      "Google sign-in could not be verified. Please try again."
    );
  }

  if (
    !payload ||
    payload.email_verified !== true ||
    typeof payload.email !== "string" ||
    !payload.sub
  ) {
    throw createAuthError(
      "Your Google account email could not be verified. Please try again."
    );
  }

  const result = await pool.query(
    `SELECT
       u.id,
       u.business_id,
       u.name,
       u.email,
       u.role,
       u.is_active,
       u.token_version,
       b.name AS business_name
     FROM users u
     JOIN businesses b ON b.id = u.business_id
     WHERE LOWER(u.email) = LOWER($1)
     LIMIT 2`,
    [payload.email.trim()]
  );

  if (result.rows.length > 1) {
    throw createAuthError(
      "This Google email matches multiple Beevo accounts. Please contact support.",
      409
    );
  }

  const user = result.rows[0];

  if (!user) {
    throw createAuthError(
      "No Beevo account is linked to this Google email. Please register first.",
      404
    );
  }

  if (!user.is_active) {
    throw createAuthError(
      "This account is currently inactive. Please contact your business administrator.",
      403
    );
  }

  return user;
}
