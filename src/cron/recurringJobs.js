const cron = require('node-cron');
const recurringTransactionService = require('../services/recurringTransactionService');

function initRecurringJobs() {
  // Run daily at midnight: 0 0 * * *
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running scheduled recurring transactions processing at midnight...');
    try {
      await recurringTransactionService.processDueRecurringTransactions();
      console.log('[Cron] Scheduled recurring transactions processing completed successfully.');
    } catch (err) {
      console.error('[Cron] Error processing scheduled recurring transactions:', err.message);
    }
  });

  console.log('[Cron] Daily midnight recurring transaction job initialized (0 0 * * *)');
}

module.exports = {
  initRecurringJobs,
};

