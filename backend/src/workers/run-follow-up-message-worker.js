import "dotenv/config";
import pool from "../config/database.js";
import { processDueFollowUpMessages } from "./follow-up-message.worker.js";

const pollInterval = Math.max(
  1000,
  Number(process.env.MESSAGE_WORKER_POLL_INTERVAL_MS) || 5000,
);

const batchSize = Math.max(
  1,
  Math.min(100, Number(process.env.MESSAGE_WORKER_BATCH_SIZE) || 10),
);

let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

console.log("Beevo scheduled-message worker started.");

try {
  while (!stopping) {
    try {
      const result = await processDueFollowUpMessages({ batchSize });

      if (result.processed > 0) {
        console.log("Beevo message worker cycle:", result);
      }
    } catch (error) {
      console.error("Beevo message worker cycle failed:", error.message);
    }

    if (!stopping) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }
} finally {
  await pool.end();
  console.log("Beevo scheduled-message worker stopped.");
}
