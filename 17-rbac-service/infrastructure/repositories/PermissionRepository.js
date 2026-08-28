/**
 * PermissionRepository.js - Infrastructure Repository (PostgreSQL)
 *
 * اسکیمای واقعی دیتابیس (migration 002 — جداول موجود در safar_service):
 *   permissions(id, name, module, description, created_at, updated_at)
 *   roles(id, name, display_name, description, is_system, ...)
 *   role_permissions(role_id, permission_id, created_at)
 *   user_roles(user_id, role_id, assigned_by, created_at)
 *
 * لایه دامنه از اصطلاح "slug" استفاده می‌کند که در این Repository به ستون `name` نگاشت می‌شود.
 * بدون ORM — کوئری مستقیم SQL (هم‌راستا با سایر ماژول‌های پروژه)
 */
const { Pool } = require('pg');
const Permission = require('../../domain/entities/Permission');

class PermissionRepository {
  constructor(pool) {
    this.pool = pool || new Pool();
  }

  _map(row) {
    return new Permission({
      id: row.id,
      slug: row.name,          // domain 'slug' ↔ DB column 'name'
      description: row.description,
      moduleName: row.module,  // domain 'moduleName' ↔ DB column 'module'
    });
  }

  async findAll() {
    const { rows } = await this.pool.query('SELECT * FROM permissions ORDER BY module, name');
    return rows.map((r) => this._map(r));
  }

  async findBySlug(slug) {
    const { rows } = await this.pool.query('SELECT * FROM permissions WHERE name = $1', [slug]);
    return rows[0] ? this._map(rows[0]) : null;
  }

  async create({ slug, description, moduleName }) {
    const { rows } = await this.pool.query(
      `INSERT INTO permissions (name, description, module)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, module = EXCLUDED.module, updated_at = NOW()
       RETURNING *`,
      [slug, description, moduleName],
    );
    return this._map(rows[0]);
  }

  async remove(slug) {
    const { rowCount } = await this.pool.query('DELETE FROM permissions WHERE name = $1', [slug]);
    return rowCount > 0;
  }

  /** شناسه نقش از نام نقش (جدول roles) */
  async getRoleIdByName(roleName) {
    const { rows } = await this.pool.query('SELECT id FROM roles WHERE name = $1 LIMIT 1', [roleName]);
    return rows[0] ? rows[0].id : null;
  }

  /** مجوزهای یک نقش (لیست slug) */
  async getPermissionsForRole(roleName) {
    const { rows } = await this.pool.query(
      `SELECT p.name AS slug FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN roles r ON r.id = rp.role_id
       WHERE r.name = $1`,
      [roleName],
    );
    return rows.map((r) => r.slug);
  }

  /** نگاشت نقش → مجوزها برای همه نقش‌ها (برای middleware کم‌هزینه) */
  async getRolePermissionsMap() {
    const { rows } = await this.pool.query(
      `SELECT r.name AS role_name, p.name AS slug
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       JOIN roles r ON r.id = rp.role_id`,
    );
    const map = {};
    for (const r of rows) {
      (map[r.role_name] = map[r.role_name] || []).push(r.slug);
    }
    return map;
  }

  /** اختصاص مجوز به نقش (idempotent) — نقش در صورت نبود ساخته می‌شود */
  async assignPermissionToRole(roleName, slug) {
    const perm = await this.findBySlug(slug);
    if (!perm) throw new Error(`Permission not found: ${slug}`);
    let roleId = await this.getRoleIdByName(roleName);
    if (!roleId) {
      const ins = await this.pool.query(
        `INSERT INTO roles (name, display_name, is_system) VALUES ($1, $1, FALSE) RETURNING id`,
        [roleName],
      );
      roleId = ins.rows[0].id;
    }
    await this.pool.query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleId, perm.id],
    );
    return true;
  }

  /** سلب مجوز از نقش */
  async revokePermissionFromRole(roleName, slug) {
    const perm = await this.findBySlug(slug);
    if (!perm) return false;
    const roleId = await this.getRoleIdByName(roleName);
    if (!roleId) return false;
    const { rowCount } = await this.pool.query(
      'DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
      [roleId, perm.id],
    );
    return rowCount > 0;
  }

  // ── انتساب نقش به کاربر (user_roles) ─────────────────────────────

  /**
   * نقش‌های یک کاربر (لیست نام نقش) — از user_roles + roles
   * @param {string} userId UUID
   */
  async getRolesForUser(userId) {
    const { rows } = await this.pool.query(
      `SELECT r.name FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.name);
  }

  /**
   * انتساب نقش به کاربر (idempotent).
   * @param {{userId: string, roleName: string, assignedBy?: string|null}} params
   * @returns {Promise<boolean>} true اگر انتساب جدید انجام شد
   */
  async assignRoleToUser({ userId, roleName, assignedBy = null }) {
    const roleId = await this.getRoleIdByName(roleName);
    if (!roleId) {
      const err = new Error(`Unknown role: ${roleName}`);
      err.status = 400;
      throw err;
    }
    const { rowCount } = await this.pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleId, assignedBy],
    );
    return rowCount > 0;
  }

  /**
   * سلب نقش از کاربر.
   * @returns {Promise<boolean>} true اگر نقشی حذف شد
   */
  async revokeRoleFromUser({ userId, roleName }) {
    const roleId = await this.getRoleIdByName(roleName);
    if (!roleId) return false;
    const { rowCount } = await this.pool.query(
      'DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2',
      [userId, roleId],
    );
    return rowCount > 0;
  }
}

module.exports = PermissionRepository;

