const { Pool } = require('pg');

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
        //    convert to a decimal factor (0.1) expected by PricingCalculator.
        return {
            id: row.id,
            base_fare: row.base_fare,
            price_per_km: row.price_per_km,
            price_per_minute: row.price_per_minute,
            minimum_fare: row.minimum_fare,
            commission_rate: row.commission_rate / 100,
        };
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