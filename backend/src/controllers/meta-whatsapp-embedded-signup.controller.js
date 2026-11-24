import {
  completeMetaWhatsAppEmbeddedSignup,
} from "../services/meta-whatsapp-connection.service.js";

const INVALID_INPUT_MESSAGES = new Set([
  "A valid business ID is required.",
  "A valid user ID is required.",
  "A valid WhatsApp signup state is required.",
  "A valid Meta authorization code is required.",
  "A valid WhatsApp Business Account ID is required.",
  "A valid WhatsApp phone number ID is required.",
  "The WhatsApp registration PIN must contain exactly six digits.",
]);

export async function completeMetaWhatsAppEmbeddedSignupController(req, res) {
  const {
    state,
    code,
    businessAccountId,
    phoneNumberId,
    pin,
  } = req.body ?? {};

  try {
    const data = await completeMetaWhatsAppEmbeddedSignup({
      businessId: req.user.businessId,
      userId: req.user.id,
      state,
      code,
      businessAccountId,
      phoneNumberId,
      pin,
    });

    return res.status(200).json({
      success: true,
      message: "WhatsApp has been registered and connected successfully.",
      data,
    });
  } catch (error) {
    if (
      INVALID_INPUT_MESSAGES.has(error.message) ||
      error.message ===
        "This WhatsApp signup session is invalid or has expired. Please start again."
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message ===
      "A different WhatsApp number is already connected to this business. Disconnect it before connecting another number."
    ) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Meta WhatsApp embedded signup completion failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to complete WhatsApp setup. Please try again.",
    });
  }
}
