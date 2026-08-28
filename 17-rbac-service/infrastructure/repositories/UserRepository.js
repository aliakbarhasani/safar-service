/**
 * UserRepository.js - Infrastructure Repository (PostgreSQL - فقط خواندنی برای RBAC)
 *
 * جدول users (migration 001) متعلق به ماژول auth/user است؛
 * این Repository فقط برای بررسی نقش کاربر توسط RBAC استفاده می‌شود (read-only) تا
 * مرز Bounded Context ها حفظ شود.
 */
class UserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  /** نقش کاربر بر اساس شناسه (UUID) — برای fallback وقتی نقش در توکن نیست */
  async getRoleById(userId) {
    if (!/^[0-9a-fA-F-]{36}$/.test(String(userId || ''))) return null;
    const { rows } = await this.pool.query('SELECT role FROM users WHERE id = $1 LIMIT 1', [userId]);
    return rows[0] ? rows[0].role : null;
  }
}

module.exports = UserRepository;
