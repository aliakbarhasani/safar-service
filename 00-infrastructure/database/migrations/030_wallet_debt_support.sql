-- ============================================================================
-- SAFAR SERVICE - EXPLICIT WALLET DEBT SUPPORT
-- Migration 030
-- ============================================================================
-- Trip settlement deliberately records an unpaid passenger balance as debt
-- (negative available_balance and total balance), with the passenger debit
-- transaction marked pending. Frozen funds must never be negative and the
-- invariant balance = available_balance + frozen_balance remains mandatory.
--
-- This migration supersedes the non-negative total/available balance checks
-- from migration 005. It does not modify existing balances or ledger rows.
-- The migration runner executes SQL files in order and may run this repeatedly.

ALTER TABLE wallets
    DROP CONSTRAINT IF EXISTS check_balance_non_negative;

ALTER TABLE wallets
    DROP CONSTRAINT IF EXISTS check_available_balance_non_negative;

-- Keep frozen funds non-negative; recreating this constraint is idempotent.
ALTER TABLE wallets
    DROP CONSTRAINT IF EXISTS check_frozen_balance_non_negative;

ALTER TABLE wallets
    ADD CONSTRAINT check_frozen_balance_non_negative
    CHECK (frozen_balance >= 0);

-- Retain/reassert the accounting invariant without restricting legitimate debt.
ALTER TABLE wallets
    DROP CONSTRAINT IF EXISTS ck_wallet_balance_total;

ALTER TABLE wallets
    ADD CONSTRAINT ck_wallet_balance_total
    CHECK (balance = available_balance + frozen_balance);
