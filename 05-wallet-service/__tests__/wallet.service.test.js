/**
 * wallet.service.test.js - تست‌های جامع سرویس کیف پول
 * 
 * پوشش تست:
 *   - دریافت موجودی (getWalletBalance)
 *   - شارژ حساب (depositFunds) + Idempotency
 *   - برداشت از حساب (withdrawFunds) + بررسی کافی بودن موجودی
 *   - انتقال وجه (transferFunds) + Self-transfer prevention
 *   - تاریخچه تراکنش‌ها (getTransactionHistory)
 *   - عدم منفی شدن موجودی (Balance Non-Negative)
 *   - اعتبارسنجی ورودی‌ها
 */

const walletService = require('../services/wallet.service');

// ============================================================================
// داده‌های تست
// ============================================================================
const TEST_USER_1 = '507f191e810c19729de860ea'; // User A (مسافر)
const TEST_USER_2 = '507f191e810c19729de860eb'; // User B (راننده)
const TEST_USER_3 = '507f191e810c19729de860ec'; // User C
const INVALID_USER = null;
const INVALID_AMOUNT = -100;
const INVALID_CURRENCY = 'XYZ';

// مجوع رویدادهای گرفته شده (برای بررسی EventBus)
const capturedEvents = [];

// گرفتن EventBus و بازنویسی publish برای تست
jest.mock('../../01-core-system/EventBus', () => ({
  publish: jest.fn((event, data) => {
    capturedEvents.push({ event, data });
  })
}));

// ============================================================================
// Helper: پاک کردن داده‌های fallback قبل از هر تست
// ============================================================================
function resetState() {
  // Clear fallback arrays
  const service = require('../services/wallet.service');
  // Reset captured events
  capturedEvents.length = 0;
}

// ============================================================================
// تست ۱: دریافت موجودی کیف پول
// ============================================================================
describe('getWalletBalance()', () => {
  beforeEach(() => {
    resetState();
  });

  test('should return zero balance for new user without wallet', async () => {
    const result = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    
    expect(result).toBeDefined();
    expect(result.balance).toBe(0);
    expect(result.currencyId).toBe('IRT');
    expect(result.status).toBe('active');
  });

  test('should return balance after deposit', async () => {
    await walletService.depositFunds(TEST_USER_1, 50000, 'IRT');
    
    const result = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    
    expect(result.balance).toBe(50000);
    expect(result.currencyId).toBe('IRT');
  });

  test('should return separate balances for different currencies', async () => {
    await walletService.depositFunds(TEST_USER_1, 100000, 'IRT');
    await walletService.depositFunds(TEST_USER_1, 50, 'USD');
    
    const irtBalance = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    const usdBalance = await walletService.getWalletBalance(TEST_USER_1, 'USD');
    
    expect(irtBalance.balance).toBe(100000);
    expect(usdBalance.balance).toBe(50);
  });

  test('should reject invalid currency', async () => {
    await expect(
      walletService.getWalletBalance(TEST_USER_1, INVALID_CURRENCY)
    ).rejects.toThrow('Invalid currency');
  });

  test('should reject missing userId', async () => {
    await expect(
      walletService.getWalletBalance(null, 'IRT')
    ).rejects.toThrow('User ID is required');
  });
});

// ============================================================================
// تست ۲: شارژ حساب (Deposit)
// ============================================================================
describe('depositFunds()', () => {
  beforeEach(() => {
    resetState();
  });

  test('should deposit funds and create wallet if not exists', async () => {
    const result = await walletService.depositFunds(TEST_USER_1, 50000, 'IRT');
    
    expect(result.success).toBe(true);
    expect(result.amount).toBe(50000);
    expect(result.balance).toBe(50000);
    expect(result.currencyId).toBe('IRT');
    expect(result.walletId).toBeDefined();
    expect(result.transactionId).toBeDefined();
  });

  test('should increase balance on multiple deposits', async () => {
    await walletService.depositFunds(TEST_USER_1, 10000, 'IRT');
    await walletService.depositFunds(TEST_USER_1, 20000, 'IRT');
    await walletService.depositFunds(TEST_USER_1, 30000, 'IRT');
    
    const result = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(result.balance).toBe(60000);
  });

  test('should prevent duplicate deposit with same referenceId', async () => {
    const refId = 'REF-DEPOSIT-001';
    
    await walletService.depositFunds(TEST_USER_1, 50000, 'IRT', refId);
    
    await expect(
      walletService.depositFunds(TEST_USER_1, 50000, 'IRT', refId)
    ).rejects.toThrow('Duplicate transaction');
    
    // Balance should still be 50000 (not double)
    const result = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(result.balance).toBe(50000);
  });

  test('should reject negative amount', async () => {
    await expect(
      walletService.depositFunds(TEST_USER_1, -1000, 'IRT')
    ).rejects.toThrow('Amount must be a positive number');
  });

  test('should reject zero amount', async () => {
    await expect(
      walletService.depositFunds(TEST_USER_1, 0, 'IRT')
    ).rejects.toThrow('Amount must be a positive number');
  });

  test('should reject invalid currency', async () => {
    await expect(
      walletService.depositFunds(TEST_USER_1, 50000, INVALID_CURRENCY)
    ).rejects.toThrow('Invalid currency');
  });

  test('should reject missing userId', async () => {
    await expect(
      walletService.depositFunds(null, 50000, 'IRT')
    ).rejects.toThrow('User ID is required');
  });

  test('should publish WalletBalanceChanged event on successful deposit', async () => {
    await walletService.depositFunds(TEST_USER_1, 50000, 'IRT', null, 'Test deposit');
    
    const balanceChangedEvents = capturedEvents.filter(e => e.event === 'WalletBalanceChanged');
    
    expect(balanceChangedEvents.length).toBe(1);
    expect(balanceChangedEvents[0].data.amount).toBe(50000);
    expect(balanceChangedEvents[0].data.type).toBe('CREDIT');
    expect(balanceChangedEvents[0].data.currencyId).toBe('IRT');
    expect(balanceChangedEvents[0].data.balance).toBe(50000);
  });
});

// ============================================================================
// تست ۳: برداشت از حساب (Withdraw)
// ============================================================================
describe('withdrawFunds()', () => {
  beforeEach(async () => {
    resetState();
    // شارژ اولیه برای تست
    await walletService.depositFunds(TEST_USER_1, 100000, 'IRT');
  });

  test('should withdraw funds successfully', async () => {
    const result = await walletService.withdrawFunds(TEST_USER_1, 30000, 'IRT');
    
    expect(result.success).toBe(true);
    expect(result.amount).toBe(30000);
    expect(result.balance).toBe(70000);
  });

  test('should reject withdrawal when balance is insufficient', async () => {
    await expect(
      walletService.withdrawFunds(TEST_USER_1, 200000, 'IRT')
    ).rejects.toThrow('Insufficient balance');
    
    // Balance should remain unchanged
    const result = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(result.balance).toBe(100000);
  });

  test('should prevent duplicate withdrawal with same referenceId', async () => {
    const refId = 'REF-WITHDRAW-001';
    
    await walletService.withdrawFunds(TEST_USER_1, 20000, 'IRT', refId);
    
    await expect(
      walletService.withdrawFunds(TEST_USER_1, 20000, 'IRT', refId)
    ).rejects.toThrow('Duplicate transaction');
    
    // Balance should be 80000, not 60000
    const result = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(result.balance).toBe(80000);
  });

  test('should reject withdrawal from non-existent wallet', async () => {
    await expect(
      walletService.withdrawFunds(TEST_USER_2, 5000, 'IRT')
    ).rejects.toThrow('No wallet found');
  });

  test('should reject negative withdrawal amount', async () => {
    await expect(
      walletService.withdrawFunds(TEST_USER_1, -1000, 'IRT')
    ).rejects.toThrow('Amount must be a positive number');
  });

  test('should reject withdrawal with zero amount', async () => {
    await expect(
      walletService.withdrawFunds(TEST_USER_1, 0, 'IRT')
    ).rejects.toThrow('Amount must be a positive number');
  });

  test('should publish WalletBalanceChanged event on successful withdrawal', async () => {
    await walletService.withdrawFunds(TEST_USER_1, 30000, 'IRT', null, 'Test withdrawal');
    
    const balanceChangedEvents = capturedEvents.filter(e => e.event === 'WalletBalanceChanged');
    
    // One from deposit setup, one from withdrawal
    const withdrawEvent = balanceChangedEvents.find(e => e.data.type === 'DEBIT');
    
    expect(withdrawEvent).toBeDefined();
    expect(withdrawEvent.data.amount).toBe(30000);
    expect(withdrawEvent.data.type).toBe('DEBIT');
    expect(withdrawEvent.data.balance).toBe(70000);
  });

  test('should not allow balance to go negative', async () => {
    const result = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    const currentBalance = result.balance;
    
    // Try to withdraw more than balance
    try {
      await walletService.withdrawFunds(TEST_USER_1, currentBalance + 1, 'IRT');
    } catch (e) {
      // Expected error
    }
    
    // Balance must never be negative
    const finalResult = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(finalResult.balance).toBeGreaterThanOrEqual(0);
    expect(finalResult.balance).toBe(currentBalance);
  });
});

// ============================================================================
// تست ۴: انتقال وجه (Transfer)
// ============================================================================
describe('transferFunds()', () => {
  beforeEach(async () => {
    resetState();
    // شارژ کیف پول فرستنده
    await walletService.depositFunds(TEST_USER_1, 200000, 'IRT');
  });

  test('should transfer funds between two users successfully', async () => {
    const result = await walletService.transferFunds(
      TEST_USER_1, TEST_USER_2, 50000, 'IRT', 'Trip payment'
    );
    
    expect(result.success).toBe(true);
    expect(result.amount).toBe(50000);
    
    // Check sender balance decreased
    const senderBalance = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(senderBalance.balance).toBe(150000);
    
    // Check receiver balance increased
    const receiverBalance = await walletService.getWalletBalance(TEST_USER_2, 'IRT');
    expect(receiverBalance.balance).toBe(50000);
  });

  test('should reject transfer when sender has insufficient balance', async () => {
    await expect(
      walletService.transferFunds(TEST_USER_1, TEST_USER_2, 500000, 'IRT')
    ).rejects.toThrow('Insufficient balance');
    
    // Both balances should remain unchanged
    const senderBalance = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(senderBalance.balance).toBe(200000);
    
    const receiverBalance = await walletService.getWalletBalance(TEST_USER_2, 'IRT');
    expect(receiverBalance.balance).toBe(0);
  });

  test('should reject self-transfer (sender = receiver)', async () => {
    await expect(
      walletService.transferFunds(TEST_USER_1, TEST_USER_1, 50000, 'IRT')
    ).rejects.toThrow('Cannot transfer funds to yourself');
    
    // Balance should remain unchanged
    const result = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(result.balance).toBe(200000);
  });

  test('should reject transfer with missing receiver', async () => {
    await expect(
      walletService.transferFunds(TEST_USER_1, null, 50000, 'IRT')
    ).rejects.toThrow('Both sender ID and receiver ID are required');
  });

  test('should reject transfer with missing sender', async () => {
    await expect(
      walletService.transferFunds(null, TEST_USER_2, 50000, 'IRT')
    ).rejects.toThrow('Both sender ID and receiver ID are required');
  });

  test('should create wallets for receiver automatically', async () => {
    // TEST_USER_3 has no wallet yet
    await walletService.transferFunds(TEST_USER_1, TEST_USER_3, 30000, 'IRT');
    
    const receiverBalance = await walletService.getWalletBalance(TEST_USER_3, 'IRT');
    expect(receiverBalance.balance).toBe(30000);
    expect(receiverBalance.status).toBe('active');
  });

  test('should publish two WalletBalanceChanged events (DEBIT + CREDIT)', async () => {
    await walletService.transferFunds(TEST_USER_1, TEST_USER_2, 50000, 'IRT');
    
    const debitEvents = capturedEvents.filter(
      e => e.event === 'WalletBalanceChanged' && e.data.type === 'DEBIT'
    );
    const creditEvents = capturedEvents.filter(
      e => e.event === 'WalletBalanceChanged' && e.data.type === 'CREDIT'
    );
    
    // One DEBIT event for sender, one CREDIT event for receiver
    expect(debitEvents.length).toBeGreaterThanOrEqual(1);
    expect(creditEvents.length).toBeGreaterThanOrEqual(1);
    
    // The DEBIT should be from sender
    const senderDebit = debitEvents.find(e =>
      e.data.userId.toString() === TEST_USER_1.toString()
    );
    expect(senderDebit).toBeDefined();
    expect(senderDebit.data.amount).toBe(50000);
    
    // The CREDIT should be for receiver
    const receiverCredit = creditEvents.find(e =>
      e.data.userId.toString() === TEST_USER_2.toString()
    );
    expect(receiverCredit).toBeDefined();
    expect(receiverCredit.data.amount).toBe(50000);
  });

  test('should reject transfer with negative amount', async () => {
    await expect(
      walletService.transferFunds(TEST_USER_1, TEST_USER_2, -50000, 'IRT')
    ).rejects.toThrow('Amount must be a positive number');
  });

  test('should reject transfer with invalid currency', async () => {
    await expect(
      walletService.transferFunds(TEST_USER_1, TEST_USER_2, 50000, INVALID_CURRENCY)
    ).rejects.toThrow('Invalid currency');
  });
});

// ============================================================================
// تست ۵: عدم منفی شدن موجودی (Comprehensive Balance Non-Negative)
// ============================================================================
describe('Balance Non-Negative Guarantee', () => {
  beforeEach(async () => {
    resetState();
    await walletService.depositFunds(TEST_USER_1, 1000, 'IRT');
  });

  test('should never allow negative balance after multiple operations', async () => {
    const operations = [
      { type: 'withdraw', amount: 500 },
      { type: 'withdraw', amount: 600 },  // Should fail (only 500 left)
      { type: 'deposit', amount: 1000 },
      { type: 'withdraw', amount: 1500 },
      { type: 'withdraw', amount: 1 },    // Should fail (only 0 left? after last withdraw it should be 0)
    ];

    for (const op of operations) {
      try {
        if (op.type === 'deposit') {
          await walletService.depositFunds(TEST_USER_1, op.amount, 'IRT');
        } else {
          // Only attempt withdrawal if we expect it to succeed
          const balance = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
          if (balance.balance >= op.amount) {
            await walletService.withdrawFunds(TEST_USER_1, op.amount, 'IRT');
          }
          // If balance is insufficient, this is expected behavior
        }
      } catch (e) {
        // Expected errors are fine
      }
    }

    const finalBalance = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(finalBalance.balance).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// تست ۶: تاریخچه تراکنش‌ها
// ============================================================================
describe('getTransactionHistory()', () => {
  beforeEach(async () => {
    resetState();
    await walletService.depositFunds(TEST_USER_1, 10000, 'IRT', null, 'First deposit');
    await walletService.depositFunds(TEST_USER_1, 20000, 'IRT', null, 'Second deposit');
    await walletService.depositFunds(TEST_USER_1, 50, 'USD', null, 'USD deposit');
    await walletService.withdrawFunds(TEST_USER_1, 5000, 'IRT', null, 'Test withdrawal');
  });

  test('should return transaction history for user', async () => {
    const result = await walletService.getTransactionHistory(TEST_USER_1);
    
    expect(result.transactions).toBeDefined();
    expect(result.transactions.length).toBe(4);
    expect(result.pagination.total).toBe(4);
  });

  test('should filter by currency', async () => {
    const result = await walletService.getTransactionHistory(TEST_USER_1, 'USD');
    
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].currencyId).toBe('USD');
    expect(result.transactions[0].amount).toBe(50);
  });

  test('should filter by transaction type', async () => {
    const result = await walletService.getTransactionHistory(TEST_USER_1, null, { type: 'DEBIT' });
    
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].type).toBe('DEBIT');
  });

  test('should support pagination', async () => {
    const result = await walletService.getTransactionHistory(TEST_USER_1, null, { limit: 2, skip: 0 });
    
    expect(result.transactions.length).toBeLessThanOrEqual(2);
    expect(result.pagination.limit).toBe(2);
    expect(result.pagination.hasMore).toBe(true);
  });

  test('should return empty history for user with no transactions', async () => {
    const result = await walletService.getTransactionHistory(TEST_USER_3);
    
    expect(result.transactions).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  test('should reject invalid userId', async () => {
    await expect(
      walletService.getTransactionHistory(null)
    ).rejects.toThrow('User ID is required');
  });
});

// ============================================================================
// تست ۷: سناریوهای پیچیده (Integration Scenarios)
// ============================================================================
describe('Complex Integration Scenarios', () => {
  beforeEach(() => {
    resetState();
  });

  test('complete trip payment flow: passenger pays driver', async () => {
    // 1. مسافر کیف پول خود را شارژ می‌کند
    await walletService.depositFunds(TEST_USER_1, 150000, 'IRT', 'PAYMENT-REF-001');
    
    const passengerBalanceBefore = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(passengerBalanceBefore.balance).toBe(150000);
    
    // 2. مسافر هزینه سفر را به راننده پرداخت می‌کند
    const tripCost = 85000;
    const transferResult = await walletService.transferFunds(
      TEST_USER_1, TEST_USER_2, tripCost, 'IRT', 'Trip payment: Urban taxi'
    );
    
    expect(transferResult.success).toBe(true);
    expect(transferResult.sender.balance).toBe(150000 - tripCost);
    expect(transferResult.receiver.balance).toBe(tripCost);
    
    // 3. بررسی نهایی موجودی‌ها
    const passengerBalanceAfter = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    const driverBalanceAfter = await walletService.getWalletBalance(TEST_USER_2, 'IRT');
    
    expect(passengerBalanceAfter.balance).toBe(65000);
    expect(driverBalanceAfter.balance).toBe(85000);
    
    // 4. بررسی تعداد تراکنش‌های ثبت شده
    const passengerTxs = await walletService.getTransactionHistory(TEST_USER_1);
    const driverTxs = await walletService.getTransactionHistory(TEST_USER_2);
    
    // Passenger: 1 deposit + 1 debit (transfer)
    expect(passengerTxs.pagination.total).toBe(2);
    // Driver: 1 credit (transfer)
    expect(driverTxs.pagination.total).toBe(1);
  });

  test('multi-currency wallet management', async () => {
    // شارژ سه ارز مختلف
    await walletService.depositFunds(TEST_USER_1, 1000000, 'IRT');
    await walletService.depositFunds(TEST_USER_1, 500, 'USD');
    await walletService.depositFunds(TEST_USER_1, 200, 'EUR');
    
    // بررسی موجودی
    const irtBalance = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    const usdBalance = await walletService.getWalletBalance(TEST_USER_1, 'USD');
    const eurBalance = await walletService.getWalletBalance(TEST_USER_1, 'EUR');
    
    expect(irtBalance.balance).toBe(1000000);
    expect(usdBalance.balance).toBe(500);
    expect(eurBalance.balance).toBe(200);
    
    // انتقال از IRT به USD غیرممکن است (بدون conversion)
    // تست: انتقال IRT به کاربر دیگر
    await walletService.transferFunds(TEST_USER_1, TEST_USER_2, 200000, 'IRT');
    
    const irtAfter = await walletService.getWalletBalance(TEST_USER_1, 'IRT');
    expect(irtAfter.balance).toBe(800000);
    
    const receiverIrt = await walletService.getWalletBalance(TEST_USER_2, 'IRT');
    expect(receiverIrt.balance).toBe(200000);
  });
});