-- ============================================================================
-- SAFAR SERVICE - RBAC (Role-Based Access Control)
-- PostgreSQL Migration 010
-- ============================================================================
-- Dynamic permission system: permissions are stored in DB and mapped to roles
-- No hardcoded permissions in application code
--
-- IMPORTANT (schema alignment):
-- The authoritative RBAC schema is defined by migration 002
-- (`permissions(id, name, module, ...)`, `role_permissions(role_id, permission_id)`),
-- which `17-rbac-service/infrastructure/repositories/PermissionRepository.js` reads/writes.
--
-- This file has been realigned with that reference. It no longer creates the
-- divergent columns `slug`/`module_name`/`role_name`. It is idempotent and safe
-- to run repeatedly, and it also migrates any database that previously received
-- the old 010 layout (slug/module_name/role_name) forward into the canonical shape.
-- ============================================================================

-- ============================================================================
-- BACKWARD-COMPAT GUARD: repair legacy 010 column names (if present)
-- If a database was created by the OLD migration 010 (permissions.slug /
-- permissions.module_name / role_permissions.role_name), rename those columns
-- so the schema matches migration 002 while preserving existing data.
-- ============================================================================
DO $$
BEGIN
    -- permissions.slug -> permissions.name (only when 'slug' exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'permissions' AND column_name = 'slug'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'permissions' AND column_name = 'name'
    ) THEN
        ALTER TABLE permissions RENAME COLUMN slug TO name;
    END IF;

    -- permissions.module_name -> permissions.module (only when 'module_name' exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'permissions' AND column_name = 'module_name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'permissions' AND column_name = 'module'
    ) THEN
        ALTER TABLE permissions RENAME COLUMN module_name TO module;
    END IF;

    -- role_permissions.role_name -> role_id (only when 'role_name' exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'role_permissions' AND column_name = 'role_name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'role_permissions' AND column_name = 'role_id'
    ) THEN
        ALTER TABLE role_permissions RENAME COLUMN role_name TO role_id;
        ALTER TABLE role_permissions ALTER COLUMN role_id TYPE UUID USING role_id::uuid;
    END IF;
END $$;

-- ============================================================================
-- TABLE: permissions
-- Canonical layout identical to migration 002:
--   id, name (UNIQUE), module, description, created_at, updated_at
-- ============================================================================
CREATE TABLE IF NOT EXISTS permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(128) NOT NULL UNIQUE,
    module      VARCHAR(64) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

-- ============================================================================
-- TABLE: role_permissions
-- Canonical many-to-many mapping (role_id -> roles.id, permission_id -> permissions.id)
-- Identical to migration 002:
--   role_id, permission_id, created_at  |  PRIMARY KEY (role_id, permission_id)
-- ============================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
</arg_value></tool_call>