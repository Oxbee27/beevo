import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

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

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Beevo API",
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    service: "beevo-backend",
  });
});

app.listen(PORT, () => {
  console.log(`Beevo API running at http://localhost:${PORT}`);
});