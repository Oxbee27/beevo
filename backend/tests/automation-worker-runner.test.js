import { describe, expect, it, vi } from "vitest";
import { startAutomationWorker } from "../src/workers/automation-worker-runner.js";

describe("startAutomationWorker", () => {
  it("runs automation cycles until stopped and then resolves", async () => {
    let worker;
    const processDueRestockCampaigns = vi.fn().mockResolvedValue({
      processed: 0,
    });
    const processDueFollowUpMessages = vi.fn().mockResolvedValue({
      processed: 0,
    });

    worker = startAutomationWorker({
      processDueRestockCampaigns,
      processDueFollowUpMessages,
      pollInterval: 1000,
      batchSize: 10,
      restockBatchSize: 10,
      logger: {
        log: vi.fn(),
        error: vi.fn(),
      },
    });

    await vi.waitFor(() => {
      expect(processDueFollowUpMessages).toHaveBeenCalledOnce();
    });

    worker.stop();
    await expect(worker.done).resolves.toBeUndefined();

    expect(processDueRestockCampaigns).toHaveBeenCalledOnce();
    expect(processDueFollowUpMessages).toHaveBeenCalledOnce();
  });

  it("can be stopped while waiting between cycles", async () => {
    const processDueRestockCampaigns = vi.fn().mockResolvedValue({
      processed: 0,
    });
    const processDueFollowUpMessages = vi.fn().mockResolvedValue({
      processed: 0,
    });

    const worker = startAutomationWorker({
      processDueRestockCampaigns,
      processDueFollowUpMessages,
      pollInterval: 60000,
      batchSize: 10,
      restockBatchSize: 10,
      logger: {
        log: vi.fn(),
        error: vi.fn(),
      },
    });

    await vi.waitFor(() => {
      expect(processDueFollowUpMessages).toHaveBeenCalledOnce();
    });

    worker.stop();
    await expect(worker.done).resolves.toBeUndefined();
  });

  it("runs another automation cycle after the configured polling interval", async () => {
    const processDueRestockCampaigns = vi.fn().mockResolvedValue({
      processed: 0,
    });
    const processDueFollowUpMessages = vi.fn().mockResolvedValue({
      processed: 0,
    });

    const worker = startAutomationWorker({
      processDueRestockCampaigns,
      processDueFollowUpMessages,
      pollInterval: 25,
      batchSize: 10,
      restockBatchSize: 10,
      logger: {
        log: vi.fn(),
        error: vi.fn(),
      },
    });

    try {
      await vi.waitFor(() => {
        expect(processDueFollowUpMessages).toHaveBeenCalledTimes(2);
      }, { timeout: 2000 });
    } finally {
      worker.stop();
      await worker.done;
    }

    expect(processDueRestockCampaigns).toHaveBeenCalledTimes(2);
  });

});
