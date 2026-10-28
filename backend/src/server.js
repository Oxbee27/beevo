
import { authenticateToken } from "./middleware/auth.middleware.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import enquiryRoutes from "./routes/enquiry.routes.js";
import followUpRoutes from "./routes/follow-up.routes.js";




dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN =
  process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(helmet());

app.use(
  cors({
    origin: CORS_ORIGIN,
  }),
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




// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

// Central error handler
app.use((error, req, res, next) => {
  console.error("Request error:", error.message);

  const status = Number.isInteger(error.status)
    && error.status >= 400
    && error.status <= 599
      ? error.status
      : 500;

  res.status(status).json({
    success: false,
    message: status === 500
      ? "Internal server error."
      : error.message,
  });
});

app.listen(PORT, () => {
  console.log(`Beevo API running on port ${PORT}`);
});
