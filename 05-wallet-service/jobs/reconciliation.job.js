/**
 * reconciliation.job.js - مغایرت‌گیری روزانه کیف پول
 * 
 * این Job به صورت دوره‌ای اجرا می‌شود و تطابق بین:
 *   - موجودی فعلی کیف پول‌ها (wallets.balance)
 *   - جمع تراکنش‌های wallet_ledger
 * را بررسی می‌کند.
 * 
 * در صورت مغایرت، رکورد در financial_audit_logs ثبت می‌شود.
 * 
 * زمان‌بندی پیشنهادی: هر ۲۴ ساعت یکبار (Cron: 0 0 * * *)
 */

const pg = require('../db/pg');
const Wallet = require('../models/wallet.model');

// ============================================================================
// رنگ‌بندی لاگ
// ============================================================================
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

/**
 * اجرای مغایرت‌گیری برای یک کیف پول خاص
 * @param {string} walletId - شناسه کیف پول
 * @returns {Object} نتیجه مغایرت‌گیری
 */
async function reconcileSingleWallet(walletId) {
  try {
    const snapshot = await Wallet.getReconciliationSnapshot(walletId);

    if (!snapshot) {
      return {
        walletId,
        status: 'error',
        message: 'Wallet not found'
      };
    }

    const {
      wallet_id,
      total_balance,
      available_balance,
      frozen_balance,
      ledger_total_credits,
      ledger_total_debits,
      ledger_balance
    } = snapshot;

    const walletBalance = parseFloat(total_balance);
    const calculatedBalance = parseFloat(ledger_balance);

    if (walletBalance !== calculatedBalance) {
      const discrepancy = walletBalance - calculatedBalance;

      // ثبت مغایرت در financial_audit_logs
      await pg.query(
        `INSERT INTO financial_audit_logs
         (event_type, wallet_id, previous_state, new_state, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'reconciliation_discrepancy',
          wallet_id,
          JSON.stringify({ walletBalance, ledgerCredits: ledger_total_credits, ledgerDebits: ledger_total_debits }),
          JSON.stringify({ discrepancy, calculatedBalance }),
          `Reconciliation discrepancy: wallet=${walletBalance}, ledger=${calculatedBalance}, diff=${discrepancy}`
        ]
      );

      return {
        walletId: wallet_id,
        status: 'discrepancy_found',
        walletBalance,
        calculatedBalance,
        discrepancy,
        message: `Discrepancy of ${discrepancy} units found`
      };
    }

    return {
      walletId: wallet_id,
      status: 'ok',
      walletBalance,
      calculatedBalance,
      discrepancy: 0,
      message: 'Balances match'
    };
  } catch (error) {
    return {
      walletId,
      status: 'error',
      message: error.message
    };
  }
}

/**
 * اجرای مغایرت‌گیری برای تمام کیف پول‌های فعال
 * @returns {Object} گزارش کامل مغایرت‌گیری
 */
async function runFullReconciliation() {
  console.log(`\n${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   Wallet Reconciliation Job Started${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}\n`);

  const startTime = Date.now();

  try {
    // دریافت تمام کیف پول‌های فعال
    const result = await pg.query(
      `SELECT id, user_id, currency_id, balance, available_balance, frozen_balance
       FROM wallets WHERE deleted_at IS NULL`
    );
    const wallets = result.rows;

    console.log(`Total active wallets: ${wallets.length}\n`);

    let okCount = 0;
    let discrepancyCount = 0;
    let errorCount = 0;
    const discrepancies = [];

    // مغایرت‌گیری تک‌تک
    for (const wallet of wallets) {
      const recResult = await reconcileSingleWallet(wallet.id);
      
      if (recResult.status === 'ok') {
        okCount++;
      } else if (recResult.status === 'discrepancy_found') {
        discrepancyCount++;
        discrepancies.push(recResult);
        console.log(`  ${colors.red}✗${colors.reset} Wallet ${wallet.id.substring(0, 8)}... | Currency: ${wallet.currency_id} | Balance: ${wallet.balance} | Discrepancy: ${recResult.discrepancy}`);
      } else {
        errorCount++;
        console.log(`  ${colors.yellow}!${colors.reset} Wallet ${wallet.id.substring(0, 8)}... | Error: ${recResult.message}`);
      }
    }

    // گزارش نهایی
    const duration = Date.now() - startTime;
    const total = wallets.length;

    console.log(`\n${colors.bright}${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}   Reconciliation Complete${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
    console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`  Total Wallets: ${total}`);
    console.log(`  ${colors.green}OK: ${okCount}${colors.reset}`);
    console.log(`  ${colors.red}Discrepancies: ${discrepancyCount}${colors.reset}`);
    console.log(`  ${colors.yellow}Errors: ${errorCount}${colors.reset}`);

    if (discrepancies.length > 0) {
      console.log(`\n${colors.red}${colors.bright}Discrepancy Details:${colors.reset}`);
      discrepancies.forEach(d => {
        console.log(`  - Wallet: ${d.walletId}`);
        console.log(`    Wallet Balance: ${d.walletBalance}`);
        console.log(`    Ledger Balance: ${d.calculatedBalance}`);
        console.log(`    Difference: ${d.discrepancy}`);
      });
    }

    // ثبت لاگ اتمام مغایرت‌گیری
    await pg.query(
      `INSERT INTO financial_audit_logs
       (event_type, previous_state, new_state, description)
       VALUES ($1, $2, $3, $4)`,
      [
        'reconciliation_run',
        JSON.stringify({}),
        JSON.stringify({
          total,
          okCount,
          discrepancyCount,
          errorCount,
          duration: `${(duration / 1000).toFixed(2)}s`
        }),
        `Full reconciliation completed: ${okCount}/${total} OK, ${discrepancyCount} discrepancies, ${errorCount} errors`
      ]
    );

    return {
      success: true,
      duration: `${(duration / 1000).toFixed(2)}s`,
      total,
      ok: okCount,
      discrepancies: discrepancyCount,
      errors: errorCount,
      discrepancyDetails: discrepancies
    };
  } catch (error) {
    console.error(`${colors.red}Fatal reconciliation error:${colors.reset}`, error.message);

    await pg.query(
      `INSERT INTO financial_audit_logs
       (event_type, description)
       VALUES ($1, $2)`,
      ['reconciliation_failed', `Reconciliation failed: ${error.message}`]
    );

    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * بررسی تطابق یک تراکنش خاص با Ledger
 */
async function verifyTransaction(txId) {
  const result = await pg.query(
    `SELECT t.*, wl.id as ledger_id, wl.credit_amount, wl.debit_amount, wl.balance_after as ledger_balance
     FROM transactions t
     LEFT JOIN wallet_ledger wl ON wl.transaction_id = t.id
     WHERE t.id = $1`,
    [txId]
  );

  if (result.rows.length === 0) {
    return { status: 'not_found', message: 'Transaction not found' };
  }

  const tx = result.rows[0];
  
  if (!tx.ledger_id) {
    return {
      status: 'warning',
      message: 'Transaction exists but has no ledger entry',
      transaction: tx
    };
  }

  return {
    status: 'verified',
    message: 'Transaction and ledger match',
    transaction: tx
  };
}

// اگر مستقیم اجرا شود
if (require.main === module) {
  runFullReconciliation()
    .then(() => {
      console.log(`\n${colors.green}Reconciliation job finished.${colors.reset}\n`);
      process.exit(0);
    })
    .catch(err => {
      console.error(`${colors.red}Fatal:${colors.reset}`, err.message);
      process.exit(1);
    });
}

module.exports = {
  reconcileSingleWallet,
  runFullReconciliation,
  verifyTransaction,
};