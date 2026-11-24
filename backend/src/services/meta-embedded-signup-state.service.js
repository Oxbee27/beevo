import { createHash, randomBytes } from "node:crypto";
import pool from "../config/database.js";

const STATE_TTL_MINUTES = 10;

function validatePositiveId(value, label) {
  if (
    value === undefined ||
    value === null ||
    !/^[1-9]\d*$/.test(String(value))
  ) {
    throw new Error(`A valid ${label} is required.`);
  }
}

function hashState(state) {
  return createHash("sha256").update(state).digest("hex");
}

export async function createMetaEmbeddedSignupState(
  businessId,
  userId,
  db = pool,
) {
  validatePositiveId(businessId, "business ID");
  validatePositiveId(userId, "user ID");

  const state = randomBytes(32).toString("hex");
  const stateHash = hashState(state);

  const result = await db.query(
    `
      INSERT INTO meta_embedded_signup_states (
        state_hash,
        business_id,
        user_id,
        expires_at
      )
      SELECT
        $1,
        $2,
        $3,
        NOW() + INTERVAL '${STATE_TTL_MINUTES} minutes'
      FROM users
      WHERE id = $3
        AND business_id = $2
        AND role = 'owner'
      RETURNING expires_at
    `,
    [stateHash, String(businessId), String(userId)],
  );

  if (result.rows.length === 0) {
    throw new Error("Business owner account could not be verified.");
  }

  return {
    state,
    expiresAt: new Date(result.rows[0].expires_at).toISOString(),
  };
}

/**
 * Atomically consumes a signup state.
 * Returns the associated business/user IDs once, or null if invalid,
 * expired, already consumed, or associated with another tenant/user.
 */
export async function consumeMetaEmbeddedSignupState(
  state,
  businessId,
  userId,
  db = pool,
) {
  validatePositiveId(businessId, "business ID");
  validatePositiveId(userId, "user ID");

  if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) {
    return null;
  }

  const result = await db.query(
    `
      UPDATE meta_embedded_signup_states
      SET consumed_at = NOW()
      WHERE state_hash = $1
        AND business_id = $2
        AND user_id = $3
        AND expires_at > NOW()
        AND consumed_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM users u
          WHERE u.id = $3
            AND u.business_id = $2
            AND u.role = 'owner'
        )
      RETURNING business_id, user_id, consumed_at
    `,
    [hashState(state), String(businessId), String(userId)],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    businessId: String(result.rows[0].business_id),
    userId: String(result.rows[0].user_id),
    consumedAt: result.rows[0].consumed_at,
  };
}
