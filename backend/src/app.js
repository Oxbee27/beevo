import "dotenv/config";
import { authenticateToken } from "./middleware/auth.middleware.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import enquiryRoutes from "./routes/enquiry.routes.js";
import followUpRoutes from "./routes/follow-up.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import roleRoutes from "./routes/role.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import { handleResendWebhook } from "./controllers/resend-webhook.controller.js";



const app = express();

// Trust Render's reverse proxy (one hop).
app.set("trust proxy", 1);

const CORS_ORIGIN =
  process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(helmet());

app.use(
  cors({
    origin: CORS_ORIGIN,
  }),
);

// Resend requires the original raw request body for signature verification.
app.post(
  "/webhooks/resend",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleResendWebhook,
);

app.use(express.json({ limit: "1mb" }));
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

// Authentication routes
app.use("/auth", authRoutes);

app.use("/roles", roleRoutes);
app.use("/staff", staffRoutes);
app.use("/customers", customerRoutes);

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
app.use("/follow-ups", followUpRoutes);
app.use("/dashboard", dashboardRoutes);

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
