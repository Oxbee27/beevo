import "dotenv/config";
import pool from "../config/database.js";
import { startBeevoAutomationWorker } from "./start-beevo-automation-worker.js";

const worker = startBeevoAutomationWorker();

process.on("SIGINT", () => worker.stop());
process.on("SIGTERM", () => worker.stop());

try {
  await worker.done;
} finally {
  await pool.end();
  console.log("Beevo PostgreSQL pool closed.");
}
