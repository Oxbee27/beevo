export async function runAutomationCycle({
  processDueRestockCampaigns,
  processDueFollowUpMessages,
  restockBatchSize,
  batchSize,
  onRestockSuccess = () => {},
  onRestockError = () => {},
  onMessageSuccess = () => {},
  onMessageError = () => {},
}) {
  const result = {
    restock: null,
    messages: null,
    errors: [],
    exitCode: 0,
  };

  try {
    result.restock = await processDueRestockCampaigns({
      batchSize: restockBatchSize,
    });
    onRestockSuccess(result.restock);
  } catch (error) {
    result.errors.push({ task: "restock", error });
    result.exitCode = 1;
    onRestockError(error);
  }

  try {
    result.messages = await processDueFollowUpMessages({ batchSize });
    onMessageSuccess(result.messages);
  } catch (error) {
    result.errors.push({ task: "messages", error });
    result.exitCode = 1;
    onMessageError(error);
  }

  return result;
}
