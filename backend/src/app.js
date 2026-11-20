import "dotenv/config";
import pool from "./config/database.js";
import { verifyWhatsAppWebhook, handleWhatsAppWebhook } from "./controllers/whatsapp-webhook.controller.js";
import { authenticateToken } from "./middleware/auth.middleware.js";
import { csrfProtection } from "./middleware/csrf.middleware.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import productRoutes from "./routes/product.routes.js";
import enquiryRoutes from "./routes/enquiry.routes.js";
import followUpRoutes from "./routes/follow-up.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import roleRoutes from "./routes/role.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import { handleResendWebhook } from "./controllers/resend-webhook.controller.js";
import { handleTermiiWebhook } from "./controllers/termii-webhook.controller.js";
import { handlePaystackWebhook } from "./controllers/paystack-webhook.controller.js";



import communicationsRoutes from "./routes/communications.routes.js";
import conversationsRoutes from "./routes/conversations.routes.js";
const app = express();

// Trust Render's reverse proxy (one hop).
app.set("trust proxy", 1);

const CORS_ORIGIN =
  process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(helmet());

app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  }),
);

// Resend requires the original raw request body for signature verification.
app.post(
  "/webhooks/resend",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleResendWebhook,
);

// Termii also requires the original raw request body for signature verification.
app.post(
  "/webhooks/termii",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleTermiiWebhook,
);

 // Paystack requires the original raw body for HMAC-SHA512 verification.
app.post(
  "/webhooks/paystack",
  express.raw({ type: "application/json", limit: "1mb" }),
  handlePaystackWebhook,
);

// Meta WhatsApp webhooks: GET verification and raw-body POST signature validation.
app.get("/webhooks/whatsapp", verifyWhatsAppWebhook);
app.post(
  "/webhooks/whatsapp",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleWhatsAppWebhook,
);

app.use(express.json({ limit: "1mb" }));
app.use(csrfProtection);
// Basic API endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Beevo API",
  });
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    service: "beevo-backend",
  });
});

// Database readiness check. Keep /health as a process liveness check.
app.get("/health/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      success: true,
      status: "ready",
      service: "beevo-backend",
    });
  } catch {
    return res.status(503).json({
      success: false,
      status: "not_ready",
      service: "beevo-backend",
    });
  }
});

// Authentication routes
app.use("/auth", authRoutes);

app.use("/roles", roleRoutes);
app.use("/staff", staffRoutes);
app.use("/customers", customerRoutes);
app.use("/products", productRoutes);

app.get("/auth/me", authenticateToken, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Authentication successful.",
    data: {
      user: req.user,
    },
  });
});

app.use("/enquiries", enquiryRoutes);
app.use("/communications", communicationsRoutes);
app.use("/conversations", conversationsRoutes);
app.use("/follow-ups", followUpRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/wallet", walletRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

// Central error handler
app.use((error, req, res, next) => {
  console.error("Request error details:", {
    name: error.name,
    code: error.code,
    message: error.message,
    stack: error.stack,
  });

  if (res.headersSent) {
    return next(error);
  }

  const status =
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : 500;

  // Handle malformed JSON before applying general error messages.
  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    "body" in error
  ) {
    return res.status(400).json({
      success: false,
      message: "Your request could not be processed. Please check the information you entered.",
      errors: {
        body: "Please check that your request contains valid JSON."
      }
    });
  }

  const friendlyMessages = {
    400: "Some of the information you entered is incorrect. Please review it and try again.",
    401: "The email or password you entered is incorrect. Please try again.",
    403: "You don't have permission to perform this action. Please contact your business owner.",
    404: "We couldn't find what you're looking for. Please refresh and try again.",
    409: "This information is already in use. Please try different details.",
    422: "Some information needs your attention. Please review it and try again.",
    429: "You've made too many attempts. Please wait a little and try again.",
  };

  const message =
    error.publicMessage ||
    (status >= 500
      ? "Something went wrong while processing your request. Please try again shortly."
      : friendlyMessages[status] ||
        "We couldn't complete your request. Please try again.");

  return res.status(status).json({
    success: false,
    message,
  });
});

export default app;
