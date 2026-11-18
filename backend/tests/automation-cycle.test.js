import { describe, expect, it, vi } from "vitest";
import { runAutomationCycle } from "../src/workers/automation-cycle.js";

describe("runAutomationCycle", () => {
  it("runs both automation tasks with their configured batch sizes", async () => {
    const processDueRestockCampaigns = vi.fn().mockResolvedValue({
      processed: 2,
    });
    const processDueFollowUpMessages = vi.fn().mockResolvedValue({
      processed: 3,
    });

    const result = await runAutomationCycle({
      processDueRestockCampaigns,
      processDueFollowUpMessages,
      restockBatchSize: 20,
      batchSize: 5,
    });

    expect(processDueRestockCampaigns).toHaveBeenCalledWith({
      batchSize: 20,
    });
    expect(processDueFollowUpMessages).toHaveBeenCalledWith({
      batchSize: 5,
    });
    expect(result.restock).toEqual({ processed: 2 });
    expect(result.messages).toEqual({ processed: 3 });
    expect(result.errors).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("continues follow-up processing when restock processing fails", async () => {
    const restockError = new Error("Restock database failure");
    const processDueRestockCampaigns = vi.fn().mockRejectedValue(restockError);
    const processDueFollowUpMessages = vi.fn().mockResolvedValue({
      processed: 4,
    });
    const onRestockError = vi.fn();

    const result = await runAutomationCycle({
      processDueRestockCampaigns,
      processDueFollowUpMessages,
      restockBatchSize: 10,
      batchSize: 10,
      onRestockError,
    });

    expect(processDueFollowUpMessages).toHaveBeenCalledOnce();
    expect(onRestockError).toHaveBeenCalledWith(restockError);
    expect(result.messages).toEqual({ processed: 4 });
    expect(result.errors).toEqual([
      { task: "restock", error: restockError },
    ]);
    expect(result.exitCode).toBe(1);
  });

  it("records a follow-up failure without losing a successful restock result", async () => {
    const messageError = new Error("Message worker failure");
    const processDueRestockCampaigns = vi.fn().mockResolvedValue({
      processed: 2,
    });
    const processDueFollowUpMessages = vi.fn().mockRejectedValue(messageError);
    const onMessageError = vi.fn();

    const result = await runAutomationCycle({
      processDueRestockCampaigns,
      processDueFollowUpMessages,
      restockBatchSize: 10,
      batchSize: 10,
      onMessageError,
    });

    expect(result.restock).toEqual({ processed: 2 });
    expect(onMessageError).toHaveBeenCalledWith(messageError);
    expect(result.errors).toEqual([
      { task: "messages", error: messageError },
    ]);
    expect(result.exitCode).toBe(1);
  });

  it("records both failures and still attempts both tasks", async () => {
    const restockError = new Error("Restock failed");
    const messageError = new Error("Messages failed");
    const processDueRestockCampaigns = vi.fn().mockRejectedValue(restockError);
    const processDueFollowUpMessages = vi.fn().mockRejectedValue(messageError);

    const result = await runAutomationCycle({
      processDueRestockCampaigns,
      processDueFollowUpMessages,
      restockBatchSize: 10,
      batchSize: 10,
    });

    expect(processDueRestockCampaigns).toHaveBeenCalledOnce();
    expect(processDueFollowUpMessages).toHaveBeenCalledOnce();
    expect(result.errors).toEqual([
      { task: "restock", error: restockError },
      { task: "messages", error: messageError },
    ]);
    expect(result.exitCode).toBe(1);
  });
});
