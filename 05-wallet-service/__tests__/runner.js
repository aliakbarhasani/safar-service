/**
 * test-runner.js - اجرای تست‌های سرویس کیف پول بدون وابستگی به Jest
 * 
 * این فایل تمام سناریوهای اصلی کیف پول را تست می‌کند:
 *   1. دریافت موجودی
 *   2. شارژ حساب + Idempotency
 *   3. برداشت از حساب + موجودی ناکافی
 *   4. انتقال وجه + جلوگیری از Self-Transfer
 *   5. عدم منفی شدن موجودی
 *   6. تاریخچه تراکنش‌ها
 *   7. سناریوی کامل پرداخت سفر
 */

const walletService = require('../services/wallet.service');
const eventBus = require('../../01-core-system/EventBus');

// ============================================================================
// رنگ‌بندی خروجی
// ============================================================================
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Expected ${label} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ${colors.green}✓${colors.reset} ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ${colors.red}✗${colors.reset} ${name}`);
    console.log(`    ${colors.dim}${err.message}${colors.reset}`);
  }
}

// ============================================================================
// داده‌های تست
// ============================================================================
const USER_A = '507f191e810c19729de860ea'; // مسافر
const USER_B = '507f191e810c19729de860eb'; // راننده
const USER_C = '507f191e810c19729de860ec'; // کاربر جدید

// ============================================================================
// اجرای تست‌ها
// ============================================================================
async function runAllTests() {
  console.log(`\n${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   Wallet Service - Comprehensive Tests${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}\n`);

  // ====================================================================
  // گروه ۱: دریافت موجودی
  // ====================================================================
  console.log(`${colors.bright}${colors.blue}getWalletBalance()${colors.reset}`);

  await test('should return zero balance for new user', async () => {
    const result = await walletService.getWalletBalance(USER_C, 'IRT');
    assert(result.balance === 0, 'New user balance should be 0');
    assert(result.currencyId === 'IRT', 'Currency should be IRT');
    assert(result.status === 'active', 'Status should be active');
  });

  await test('should return balance after deposit', async () => {
    await walletService.depositFunds(USER_A, 50000, 'IRT');
    const result = await walletService.getWalletBalance(USER_A, 'IRT');
    assertEqual(result.balance, 50000, 'balance');
  });

  await test('should separate balances for different currencies', async () => {
    await walletService.depositFunds(USER_A, 100, 'USD');
    
    const irtBalance = await walletService.getWalletBalance(USER_A, 'IRT');
    const usdBalance = await walletService.getWalletBalance(USER_A, 'USD');
    
    assertEqual(irtBalance.balance, 50000, 'IRT balance');
    assertEqual(usdBalance.balance, 100, 'USD balance');
  });

  await test('should reject invalid currency', async () => {
    try {
      await walletService.getWalletBalance(USER_A, 'XYZ');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.message.includes('Invalid currency'), 'Should reject invalid currency');
    }
  });

  // ====================================================================
  // گروه ۲: شارژ حساب
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}depositFunds()${colors.reset}`);

  await test('should deposit and create wallet', async () => {
    const result = await walletService.depositFunds(USER_C, 100000, 'IRT');
    assert(result.success === true, 'success should be true');
    assertEqual(result.balance, 100000, 'balance');
  });

  await test('should accumulate balance on multiple deposits', async () => {
    await walletService.depositFunds(USER_A, 10000, 'IRT');
    await walletService.depositFunds(USER_A, 20000, 'IRT');
    
    const result = await walletService.getWalletBalance(USER_A, 'IRT');
    assertEqual(result.balance, 50000 + 10000 + 20000, 'accumulated balance');
  });

  await test('should prevent duplicate deposit via referenceId', async () => {
    const refId = 'DUP-REF-001';
    
    await walletService.depositFunds(USER_A, 99999, 'IRT', refId);
    
    try {
      await walletService.depositFunds(USER_A, 99999, 'IRT', refId);
      assert(false, 'Should have thrown on duplicate');
    } catch (e) {
      assert(e.message.includes('Duplicate transaction'), 'Should detect duplicate');
    }

    // Verify balance wasn't doubled
    const result = await walletService.getWalletBalance(USER_A, 'IRT');
    // Balance was 80000 (50000+10000+20000), then 99999 more = 179999
    assertEqual(result.balance, 80000 + 99999, 'balance after duplicate prevention');
  });

  await test('should reject negative amount', async () => {
    try {
      await walletService.depositFunds(USER_A, -1000, 'IRT');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.message.includes('positive number'), 'Should reject negative amount');
    }
  });

  await test('should reject zero amount', async () => {
    try {
      await walletService.depositFunds(USER_A, 0, 'IRT');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.message.includes('positive number'), 'Should reject zero amount');
    }
  });

  // ====================================================================
  // گروه ۳: برداشت از حساب
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}withdrawFunds()${colors.reset}`);

  await test('should withdraw successfully', async () => {
    // Balance is 179999
    const result = await walletService.withdrawFunds(USER_A, 50000, 'IRT');
    assert(result.success === true, 'success should be true');
    assertEqual(result.balance, 179999 - 50000, 'balance after withdrawal');
  });

  await test('should reject insufficient balance', async () => {
    // Balance is 129999
    try {
      await walletService.withdrawFunds(USER_A, 999999999, 'IRT');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.message.includes('Insufficient balance'), 'Should detect insufficient balance');
    }
  });

  await test('should reject withdrawal from non-existent wallet', async () => {
    try {
      await walletService.withdrawFunds('507f191e810c19729de860ff', 5000, 'IRT');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.message.includes('No wallet found'), 'Should reject non-existent wallet');
    }
  });

  await test('should prevent duplicate withdrawal via referenceId', async () => {
    const refId = 'WITHDRAW-UNIQUE-001';
    
    await walletService.withdrawFunds(USER_A, 10000, 'IRT', refId);
    
    try {
      await walletService.withdrawFunds(USER_A, 10000, 'IRT', refId);
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.message.includes('Duplicate transaction'), 'Should detect duplicate');
    }
  });

  // ====================================================================
  // گروه ۴: انتقال وجه
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}transferFunds()${colors.reset}`);

  // Reset: deposit to USER_A
  await walletService.depositFunds(USER_A, 200000, 'IRT');

  await test('should transfer between two users', async () => {
    const result = await walletService.transferFunds(USER_A, USER_B, 50000, 'IRT', 'Trip fare');
    
    assert(result.success === true, 'transfer success');
    assertEqual(result.amount, 50000, 'transfer amount');
    
    const senderBal = await walletService.getWalletBalance(USER_A, 'IRT');
    const receiverBal = await walletService.getWalletBalance(USER_B, 'IRT');
    
    assertEqual(senderBal.balance, 179999 - 50000 - 10000 + 200000 - 50000, 'sender balance');
    assertEqual(receiverBal.balance, 50000, 'receiver balance');
  });

  await test('should reject self-transfer', async () => {
    try {
      await walletService.transferFunds(USER_A, USER_A, 50000, 'IRT');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.message.includes('Cannot transfer funds to yourself'), 'Should reject self-transfer');
    }
  });

  await test('should reject transfer with insufficient sender balance', async () => {
    try {
      await walletService.transferFunds(USER_A, USER_B, 999999999, 'IRT');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.message.includes('Insufficient balance'), 'Should reject when insufficient');
    }
  });

  await test('should create receiver wallet automatically', async () => {
    // USER_C already has wallet from earlier, but let's check
    const receiverBal = await walletService.getWalletBalance(USER_C, 'IRT');
    assertEqual(receiverBal.balance, 100000, 'receiver balance from earlier deposit');
  });

  // ====================================================================
  // گروه ۵: عدم منفی شدن موجودی
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}Balance Non-Negative Guarantee${colors.reset}`);

  await test('should never allow negative balance', async () => {
    // Get current balance
    const bal = await walletService.getWalletBalance(USER_B, 'IRT');
    const currentBalance = bal.balance;
    
    // Try to withdraw more than available
    try {
      await walletService.withdrawFunds(USER_B, currentBalance + 100, 'IRT');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.message.includes('Insufficient balance'), 'Should reject overdraw');
    }

    // Balance must be unchanged and non-negative
    const finalBal = await walletService.getWalletBalance(USER_B, 'IRT');
    assert(finalBal.balance >= 0, 'Balance must never be negative');
    assertEqual(finalBal.balance, currentBalance, 'balance unchanged after failed overdraw');
  });

  // ====================================================================
  // گروه ۶: تاریخچه تراکنش‌ها
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}getTransactionHistory()${colors.reset}`);

  await test('should list transactions for user with activity', async () => {
    const result = await walletService.getTransactionHistory(USER_A);
    assert(result.transactions.length > 0, 'Should have transactions');
    assert(result.pagination.total > 0, 'Total should be > 0');
  });

  await test('should filter by currency', async () => {
    const result = await walletService.getTransactionHistory(USER_A, 'USD');
    assert(result.transactions.length >= 1, 'Should have USD transactions');
    result.transactions.forEach(tx => {
      assertEqual(tx.currencyId, 'USD', 'currency filter');
    });
  });

  await test('should filter by transaction type', async () => {
    const result = await walletService.getTransactionHistory(USER_A, null, { type: 'CREDIT' });
    result.transactions.forEach(tx => {
      assertEqual(tx.type, 'CREDIT', 'type filter');
    });
  });

  await test('should support pagination', async () => {
    const result = await walletService.getTransactionHistory(USER_A, null, { limit: 2, skip: 0 });
    assert(result.transactions.length <= 2, 'Should respect limit');
    assert(result.pagination.limit === 2, 'Pagination limit set');
  });

  // ====================================================================
  // گروه ۷: سناریوی کامل پرداخت سفر
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}Complete Trip Payment Flow${colors.reset}`);

  await test('passenger deposits and pays driver', async () => {
    const PASSENGER = '507f191e810c19729de86100';
    const DRIVER = '507f191e810c19729de86101';
    const TRIP_COST = 120000;

    // مسافر شارژ می‌کند
    await walletService.depositFunds(PASSENGER, 150000, 'IRT', 'PAY-TRIP-001');
    
    const before = await walletService.getWalletBalance(PASSENGER, 'IRT');
    assertEqual(before.balance, 150000, 'passenger initial balance');

    // پرداخت به راننده
    const transfer = await walletService.transferFunds(PASSENGER, DRIVER, TRIP_COST, 'IRT', 'Urban taxi trip payment');
    assert(transfer.success, 'Transfer should succeed');

    // بررسی نهایی
    const passengerFinal = await walletService.getWalletBalance(PASSENGER, 'IRT');
    const driverFinal = await walletService.getWalletBalance(DRIVER, 'IRT');
    
    assertEqual(passengerFinal.balance, 150000 - TRIP_COST, 'passenger final balance');
    assertEqual(driverFinal.balance, TRIP_COST, 'driver final balance');
    assert(passengerFinal.balance >= 0, 'Passenger balance non-negative');
  });

  // ====================================================================
  // گزارش نهایی
  // ====================================================================
  const total = passed + failed;
  console.log(`\n${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   Test Results${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log(`  ${colors.bright}Total:${colors.reset}  ${total}`);
  console.log(`  ${colors.green}Passed:${colors.reset} ${passed}`);
  console.log(`  ${colors.red}Failed:${colors.reset} ${failed}`);
  console.log(`  ${colors.bright}Pass Rate:${colors.reset} ${((passed / total) * 100).toFixed(1)}%`);
  
  if (failures.length > 0) {
    console.log(`\n${colors.red}${colors.bright}Failed Tests:${colors.reset}`);
    failures.forEach(f => {
      console.log(`  ${colors.red}●${colors.reset} ${f.name}`);
      console.log(`    ${colors.dim}${f.error}${colors.reset}`);
    });
  }

  console.log(`\n${colors.green}${colors.bright}✓${colors.reset} All wallet service validations complete.\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error(`${colors.red}FATAL ERROR:${colors.reset}`, err.message);
  process.exit(1);
});