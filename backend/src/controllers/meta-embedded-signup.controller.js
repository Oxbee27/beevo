import {
  createMetaEmbeddedSignupState,
} from "../services/meta-embedded-signup-state.service.js";

export async function createMetaEmbeddedSignupStateController(req, res) {
  try {
    const data = await createMetaEmbeddedSignupState(
      req.user.businessId,
      req.user.id,
    );

    return res.status(201).json({
      success: true,
      message: "Secure WhatsApp signup session created.",
      data,
    });
  } catch (error) {
    if (error.message === "Business owner account could not be verified.") {
      return res.status(403).json({
        success: false,
        message: "Only the verified business owner can start WhatsApp setup.",
      });
    }

    console.error("Meta embedded signup state creation failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to start WhatsApp setup. Please try again.",
    });
  }
}
