import {
  disconnectBusinessWhatsApp,
  getWhatsAppConnectionStatus,
} from "../services/whatsapp-connection.service.js";

export async function getWhatsAppConnectionController(req, res) {
  try {
    const data = await getWhatsAppConnectionStatus(req.user.businessId);

    return res.status(200).json({
      success: true,
      message: "WhatsApp connection status retrieved successfully.",
      data,
    });
  } catch (error) {
    console.error("WhatsApp connection status retrieval failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve WhatsApp connection status. Please try again.",
    });
  }
}

export async function disconnectWhatsAppController(req, res) {
  try {
    const result = await disconnectBusinessWhatsApp(
      req.user.businessId,
    );

    return res.status(200).json({
      success: true,
      message: result.disconnected
        ? "The business WhatsApp connection has been disconnected."
        : "No WhatsApp connection was found.",
      data: result,
    });
  } catch (error) {
    console.error("WhatsApp disconnection failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to disconnect WhatsApp. Please try again.",
    });
  }
}
