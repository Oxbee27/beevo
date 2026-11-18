import { processDueFollowUpMessages } from "./follow-up-message.worker.js";
import { processDueRestockCampaigns } from "../services/process-restock-campaigns.service.js";
import { startAutomationWorker } from "./automation-worker-runner.js";

export function startBeevoAutomationWorker(options = {}) {
  const pollInterval = Math.max(
    1000,
    Number(process.env.MESSAGE_WORKER_POLL_INTERVAL_MS) || 5000,
  );

  const batchSize = Math.max(
    1,
    Math.min(100, Number(process.env.MESSAGE_WORKER_BATCH_SIZE) || 10),
  );

  const restockBatchSize = Math.max(
    1,
    Math.min(1000, Number(process.env.RESTOCK_CAMPAIGN_BATCH_SIZE) || 10),
  );

  return startAutomationWorker({
    processDueRestockCampaigns,
    processDueFollowUpMessages,
    pollInterval,
    batchSize,
    restockBatchSize,
    ...options,
  });
}
