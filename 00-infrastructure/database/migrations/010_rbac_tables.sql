-- ============================================================================
-- SAFAR SERVICE - RBAC (Role-Based Access Control)
-- PostgreSQL Migration 010
-- ============================================================================
-- Dynamic permission system: permissions are stored in DB and mapped to roles
-- No hardcoded permissions in application code
-- ============================================================================

-- ============================================================================
-- TABLE: permissions
-- System-wide permissions that can be assigned to roles
-- ============================================================================
CREATE TABLE IF NOT EXISTS permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    module_name VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_slug ON permissions(slug);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module_name);

-- ============================================================================
-- TABLE: role_permissions
-- Many-to-many mapping between roles and permissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    role_name     VARCHAR(50) NOT NULL,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_name, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_name);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_id);
</arg_value></tool_call>