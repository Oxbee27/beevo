import { runAutomationCycle } from "./automation-cycle.js";

export function startAutomationWorker({
  processDueRestockCampaigns,
  processDueFollowUpMessages,
  pollInterval,
  batchSize,
  restockBatchSize,
  logger = console,
}) {
  let stopping = false;
  let wakeWorker = null;
  let timer = null;

  const waitForNextCycle = () =>
    new Promise((resolve) => {
      wakeWorker = resolve;

      timer = setTimeout(() => {
        timer = null;
        wakeWorker = null;
        resolve();
      }, Math.max(1, Number(pollInterval) || 5000));
    });

  const done = (async () => {
    logger.log("Beevo scheduled-message worker started.");

    try {
      while (!stopping) {
        try {
          await runAutomationCycle({
            processDueRestockCampaigns,
            processDueFollowUpMessages,
            restockBatchSize,
            batchSize,
            onRestockSuccess: (result) => {
              if (result.processed > 0) {
                logger.log("Beevo restock campaign cycle:", result);
              }
            },
            onRestockError: (error) => {
              logger.error(
                "Beevo restock campaign cycle failed:",
                error.message,
              );
            },
            onMessageSuccess: (result) => {
              if (result.processed > 0) {
                logger.log("Beevo message worker cycle:", result);
              }
            },
            onMessageError: (error) => {
              logger.error(
                "Beevo message worker cycle failed:",
                error.message,
              );
            },
          });
        } catch (error) {
          logger.error(
            "Beevo automation worker cycle failed:",
            error.message,
          );
        }

        if (!stopping) {
          await waitForNextCycle();
        }
      }
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      wakeWorker = null;
      logger.log("Beevo scheduled-message worker stopped.");
    }
  })();

  return {
    stop() {
      if (stopping) return;

      stopping = true;

      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      wakeWorker?.();
      wakeWorker = null;
    },
    done,
  };
}
