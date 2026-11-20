const cron = require('node-cron');
const recurringTransactionService = require('../services/recurringTransactionService');
const { APP_TIMEZONE } = require('../utils/dateUtil');

let running = false;

async function runRecurringCatchUp(label = 'startup') {
  // Never let two runs overlap inside one process (row locks also protect across processes).
  if (running) return;
  running = true;
  try {
    const summary = await recurringTransactionService.processDueRecurringTransactions();
    if (summary.checked > 0) {
      console.log(`[Cron] Recurring run (${label}) finished:`, JSON.stringify(summary));
    }
  } catch (err) {
    console.error(`[Cron] Recurring run (${label}) failed:`, err.message);
  } finally {
    running = false;
  }
}

function initRecurringJobs() {
  // Hourly rather than midnight-only: hosting that sleeps overnight would otherwise skip a day.
  // Posting is idempotent (schedules are locked and advanced in one transaction), so extra runs are harmless.
  cron.schedule('5 * * * *', () => runRecurringCatchUp('hourly'), { timezone: APP_TIMEZONE });
  console.log(`[Cron] Recurring transaction job scheduled hourly (timezone ${APP_TIMEZONE})`);
}

module.exports = {
  initRecurringJobs,
  runRecurringCatchUp,
};
