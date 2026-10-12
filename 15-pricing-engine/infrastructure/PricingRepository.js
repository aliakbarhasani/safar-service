const { Decimal } = require('decimal.js');
const { Pool } = require('pg');
const {
    QuoteNotFoundError,
    QuoteAlreadyConsumedError,
    QuoteExpiredError,
} = require('../domain/errors/PricingErrors');

class PricingRepository {
    constructor(dbClient) {
        this.db = dbClient;
    }

    async getActiveConfig(serviceType) {
        const query = `
            SELECT id, base_fare, price_per_km,
                   price_per_min AS price_per_minute,
                   min_fare AS minimum_fare,
                   commission_rate
            FROM pricing_configs
            WHERE service_type = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        `;
        const result = await this.db.query(query, [serviceType]);
        if (result.rows.length === 0) {
            throw new Error(`هیچ کانفیگ فعالی برای سرویس ${serviceType} یافت نشد.`);
        }

        const row = result.rows[0];
        // Mapping of the DB layer to the Domain contract:
        //  - price_per_min       -> price_per_minute
        //  - min_fare            -> minimum_fare
        //  - commission_rate is stored as a PERCENT (e.g. 10 => 10%);
        //    convert to a decimal factor (0.1) expected by PricingCalculator,
        //    using exact decimal division (never raw float `x / 100`).
        return {
            id: row.id,
            base_fare: row.base_fare,
            price_per_km: row.price_per_km,
            price_per_minute: row.price_per_minute,
            minimum_fare: row.minimum_fare,
            commission_rate: new Decimal(row.commission_rate).dividedBy(100),
        };
    }

    async getQuoteById(quoteId) {
        const query = `
            SELECT id, reference_id, pricing_config_id, service_type, currency_code,
                   gross_amount, discount_amount, tax_amount, commission_amount,
                   provider_amount, customer_final_amount, status,
                   input_snapshot, calculation_snapshot,
                   created_at, expires_at, consumed_at, cancelled_at
            FROM quotes
            WHERE id = $1
        `;
        const result = await this.db.query(query, [quoteId]);
        if (result.rows.length === 0) {
            return null;
        }
        return result.rows[0];
    }

    async consumeQuote(quoteId, referenceId, injectedClient) {
        const ownsClient = !injectedClient;
        const client = injectedClient || await this.db.connect();
        try {
            if (ownsClient) {
                await client.query('BEGIN');
            }

            // ۱. واکشی رکورد با قفل ردیف برای جلوگیری از مصرف همزمان (Race Condition)
            const selectQuery = `
                SELECT id, status, expires_at, reference_id, customer_final_amount
                FROM quotes
                WHERE id = $1
                FOR UPDATE
            `;
            const selectResult = await client.query(selectQuery, [quoteId]);

            if (selectResult.rows.length === 0) {
                throw new QuoteNotFoundError(quoteId);
            }

            const quote = selectResult.rows[0];

            // ۲. بررسی وضعیت — فقط پیش‌فاکتورهای CREATED قابل مصرف هستند
            if (quote.status !== 'CREATED') {
                throw new QuoteAlreadyConsumedError(quoteId);
            }

            // ۳. بررسی انقضا
            const now = new Date();
            if (now > new Date(quote.expires_at)) {
                throw new QuoteExpiredError(quoteId);
            }

            // ۴. به‌روزرسانی وضعیت به CONSUMED و ثبت reference_id جدید
            const updateQuery = `
                UPDATE quotes
                SET status = 'CONSUMED',
                    consumed_at = NOW(),
                    reference_id = COALESCE($2, reference_id)
                WHERE id = $1
                RETURNING id, status, reference_id, consumed_at, customer_final_amount
            `;
            const updateResult = await client.query(updateQuery, [quoteId, referenceId]);
            const consumedQuote = updateResult.rows[0];

            // ۵. ثبت رکورد حسابرسی QUOTE_CONSUMED
            const auditQuery = `
                INSERT INTO pricing_audit_logs (
                    quote_id, action_type, rule_snapshot, calculation_steps
                ) VALUES ($1, 'QUOTE_CONSUMED', $2::jsonb, $3::jsonb)
            `;
            await client.query(auditQuery, [
                quoteId,
                JSON.stringify({ quoteId, referenceId }),
                JSON.stringify({ consumedAt: consumedQuote.consumed_at }),
            ]);

            // SECURITY/CORRECTNESS: commit only if this repository owns the transaction.
            // If the client was injected from outside (e.g. Mobility trip creation),
            // COMMIT/ROLLBACK belong to the outer owner — never touch them here.
            if (ownsClient) {
                await client.query('COMMIT');
            }
            return consumedQuote;
        } catch (error) {
            if (ownsClient) {
                await client.query('ROLLBACK');
            }
            throw error;
        } finally {
            if (ownsClient) {
                client.release();
            }
        }
    }

    /**
     * Persist a coordinate-bound quote created by the mobility fare estimator.
     * The explicit ID is shared with FareQuoteStore so trips.quote_id retains
     * its foreign-key integrity and the SQL quote can be consumed transactionally.
     */
    async saveFareQuote({
        quoteId,
        serviceType,
        estimatedFare,
        currencyCode = 'IRT',
        expiresAt,
        inputSnapshot = {},
        calculationSnapshot = {},
    } = {}) {
        const amount = Number(estimatedFare);
        if (!quoteId || !serviceType || !Number.isFinite(amount) || amount <= 0 || !expiresAt) {
            const error = new Error('saveFareQuote requires quoteId, serviceType, positive amount, and expiresAt.');
            error.code = 'FARE_QUOTE_VALIDATION';
            error.statusCode = 400;
            throw error;
        }

        const config = await this.getActiveConfig(serviceType);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO quotes (
                    id, reference_id, pricing_config_id, service_type, currency_code,
                    gross_amount, discount_amount, tax_amount, commission_amount,
                    provider_amount, customer_final_amount, status,
                    input_snapshot, calculation_snapshot, expires_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, 0, 0, 0,
                    $6, $6, 'CREATED',
                    $7::jsonb, $8::jsonb, $9
                )`,
                [
                    quoteId,
                    `fare-quote:${quoteId}`,
                    config.id,
                    serviceType,
                    currencyCode,
                    amount,
                    JSON.stringify(inputSnapshot),
                    JSON.stringify(calculationSnapshot),
                    expiresAt,
                ],
            );
            await client.query(
                `INSERT INTO pricing_audit_logs (
                    quote_id, action_type, rule_snapshot, calculation_steps
                ) VALUES ($1, 'QUOTE_GENERATED', $2::jsonb, $3::jsonb)`,
                [
                    quoteId,
                    JSON.stringify({ source: 'mobility-fare-estimator', serviceType }),
                    JSON.stringify(calculationSnapshot),
                ],
            );
            await client.query('COMMIT');
            return quoteId;
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ }
            throw error;
        } finally {
            client.release();
        }
    }

    /** Expire an unpublished SQL quote only while it remains unconsumed. */
    async expireUnpublishedFareQuote(quoteId) {
        if (!quoteId) return false;
        const result = await this.db.query(
            `UPDATE quotes SET status = 'EXPIRED', updated_at = NOW()
             WHERE id = $1 AND status = 'CREATED' AND consumed_at IS NULL
             RETURNING id`,
            [quoteId],
        );
        return Boolean(result.rows && result.rows.length > 0);
    }

    async saveQuoteAndAudit(quoteEntity) {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            
            const quoteRecord = quoteEntity.toDatabaseRecord();
            
            // درج Quote
            const quoteQuery = `
                INSERT INTO quotes (
                    id, reference_id, pricing_config_id, service_type, currency_code,
                    gross_amount, discount_amount, tax_amount, commission_amount,
                    provider_amount, customer_final_amount, status,
                    input_snapshot, calculation_snapshot, expires_at
                ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, 
                    $5, $6, $7, $8, 
                    $9, $10, $11, 
                    $12, $13, $14
                ) RETURNING id
            `;
            const quoteValues = [
                quoteRecord.reference_id, quoteRecord.pricing_config_id, quoteRecord.service_type, quoteRecord.currency_code,
                quoteRecord.gross_amount, quoteRecord.discount_amount, quoteRecord.tax_amount, quoteRecord.commission_amount,
                quoteRecord.provider_amount, quoteRecord.customer_final_amount, quoteRecord.status,
                quoteRecord.input_snapshot, quoteRecord.calculation_snapshot, quoteRecord.expires_at
            ];
            
            const quoteResult = await client.query(quoteQuery, quoteValues);
            const savedQuoteId = quoteResult.rows[0].id;

            // درج Audit Log
            const auditQuery = `
                INSERT INTO pricing_audit_logs (
                    quote_id, action_type, rule_snapshot, calculation_steps
                ) VALUES ($1, $2, $3, $4)
            `;
            const auditValues = [
                savedQuoteId, 'QUOTE_GENERATED', JSON.stringify(quoteEntity.ruleSnapshot), quoteRecord.calculation_snapshot
            ];
            await client.query(auditQuery, auditValues);

            await client.query('COMMIT');
            return savedQuoteId;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = PricingRepository;