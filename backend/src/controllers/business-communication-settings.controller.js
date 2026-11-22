import pool from "../config/database.js";

const EDITABLE_FIELDS = {
  email_sender_name: { max: 150 },
  email_sender_address: { max: 255 },
  email_reply_to: { max: 255 },
  sms_sender_id: {
    max: 11,
    pattern: /^[A-Za-z0-9]{3,11}$/,
  },
  whatsapp_business_account_id: { max: 100 },
  whatsapp_phone_number_id: { max: 100 },
  whatsapp_display_number: { max: 30 },
};

const STATUS_FIELDS = [
  "email_status",
  "sms_status",
  "whatsapp_status",
];

const EDITABLE_NAMES = Object.keys(EDITABLE_FIELDS);
const SELECT_FIELDS = [...EDITABLE_NAMES, ...STATUS_FIELDS].join(", ");

const DEFAULT_SETTINGS = {
  email_sender_name: null,
  email_sender_address: null,
  email_reply_to: null,
  email_status: "not_configured",
  sms_sender_id: null,
  sms_status: "not_configured",
  whatsapp_business_account_id: null,
  whatsapp_phone_number_id: null,
  whatsapp_display_number: null,
  whatsapp_status: "not_configured",
};

function isValidEmail(value) {
  return typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function getBusinessCommunicationSettingsController(req, res) {
  try {
    const result = await pool.query(
      `SELECT ${SELECT_FIELDS}
       FROM business_communication_profiles
       WHERE business_id = $1`,
      [req.user.businessId],
    );

    return res.status(200).json({
      success: true,
      message: "Business communication settings retrieved.",
      data: {
        ...DEFAULT_SETTINGS,
        ...(result.rows[0] ?? {}),
      },
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve business communication settings.",
    });
  }
}

export async function updateBusinessCommunicationSettingsController(req, res) {
  const input = req.body ?? {};
  const keys = Object.keys(input);

  if (
    !keys.length ||
    keys.some((key) => !Object.hasOwn(EDITABLE_FIELDS, key))
  ) {
    return res.status(400).json({
      success: false,
      message: "The communication settings provided are invalid.",
    });
  }

  for (const key of keys) {
    const rule = EDITABLE_FIELDS[key];
    const value = input[key];

    if (
      value !== null &&
      (
        typeof value !== "string" ||
        value.length > rule.max ||
        (rule.pattern && !rule.pattern.test(value))
      )
    ) {
      return res.status(400).json({
        success: false,
        message: `The ${key.replaceAll("_", " ")} value is invalid.`,
      });
    }
  }

  for (const field of ["email_sender_address", "email_reply_to"]) {
    if (input[field] !== undefined &&
        input[field] !== null &&
        !isValidEmail(input[field])) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }
  }

  try {
    const businessId = req.user.businessId;

    const existing = await pool.query(
      `SELECT ${SELECT_FIELDS}
       FROM business_communication_profiles
       WHERE business_id = $1`,
      [businessId],
    );

    const current = {
      ...DEFAULT_SETTINGS,
      ...(existing.rows[0] ?? {}),
    };

    const merged = { ...current };

    for (const key of keys) {
      merged[key] = input[key];
    }

    const columns = EDITABLE_NAMES.join(", ");
    const placeholders = EDITABLE_NAMES
      .map((_, index) => `$${index + 2}`)
      .join(", ");

    const updates = EDITABLE_NAMES
      .map((field) => `${field} = EXCLUDED.${field}`)
      .join(", ");

    const values = EDITABLE_NAMES.map((field) => merged[field]);

    const result = await pool.query(
      `INSERT INTO business_communication_profiles (
         business_id, ${columns}
       )
       VALUES ($1, ${placeholders})
       ON CONFLICT (business_id) DO UPDATE SET
         ${updates},
         updated_at = NOW()
       RETURNING ${SELECT_FIELDS}`,
      [businessId, ...values],
    );

    return res.status(200).json({
      success: true,
      message: "Business communication settings updated.",
      data: result.rows[0],
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to update business communication settings.",
    });
  }
}
