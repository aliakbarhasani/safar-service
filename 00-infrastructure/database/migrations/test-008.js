const { Client } = require('pg');

const sql = `CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    phone_number        VARCHAR(20) NOT NULL,
    refresh_token_hash  VARCHAR(255) NOT NULL,
    device_info         JSONB NOT NULL DEFAULT '{}',
    is_revoked          BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at          TIMESTAMPTZ NOT NULL,
    last_used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_phone ON sessions(phone_number);
CREATE INDEX idx_sessions_refresh_hash ON sessions(refresh_token_hash);
CREATE INDEX idx_sessions_active ON sessions(is_revoked) WHERE is_revoked = FALSE;
CREATE INDEX idx_sessions_expires ON sessions(expires_at);`;

const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  database: 'safar_service',
  user: 'postgres',
  password: 'hassani220420',
});

client.connect().then(() => client.query(sql)).then(() => console.log('OK')).catch(e => console.error(e.message)).finally(() => client.end());