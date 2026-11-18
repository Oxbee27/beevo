import "dotenv/config";
import pool from "../config/database.js";
import { processDueFollowUpMessages } from "./follow-up-message.worker.js";
import { processDueRestockCampaigns } from "../services/process-restock-campaigns.service.js";
import { runAutomationCycle } from "./automation-cycle.js";

const batchSize = Math.max(
  1,
  Math.min(100, Number(process.env.MESSAGE_WORKER_BATCH_SIZE) || 10),
);

const restockBatchSize = Math.max(
  1,
  Math.min(1000, Number(process.env.RESTOCK_CAMPAIGN_BATCH_SIZE) || 10),
);

let exitCode = 0;

try {
  console.log("Beevo automation cron run started.");

  const result = await runAutomationCycle({
    processDueRestockCampaigns,
    processDueFollowUpMessages,
    restockBatchSize,
    batchSize,
    onRestockSuccess: (value) => {
      console.log("Beevo restock campaign cron completed:", value);
    },
    onRestockError: (error) => {
      console.error("Beevo restock campaign cron failed:", error.message);
    },
    onMessageSuccess: (value) => {
      console.log("Beevo message cron completed:", value);
    },
    onMessageError: (error) => {
      console.error("Beevo message cron failed:", error.message);
    },
  });

  exitCode = result.exitCode;
} finally {
  try {
    await pool.end();
  } catch (error) {
    exitCode = 1;
    console.error("Beevo could not close its database connection:", error.message);
  }
}

process.exitCode = exitCode;
