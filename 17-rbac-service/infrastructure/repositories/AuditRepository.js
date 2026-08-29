/**
 * AuditRepository.js - Infrastructure Repository (PostgreSQL)
 *
 * ثبت رویدادهای حساس در جدول audit_logs (migration 001).
 * ثبت Audit هرگز نباید عملیات اصلی را بشکند → همه خطاها fail-open با log.
 */
class AuditRepository {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * ثبت یک رویداد امنیتی.
   * @param {{eventType:string, entityType:string, entityId:string|null,
   *          actorId:string|null, metadata:object}} params
   */
  async record({ eventType, entityType, entityId = null, actorId = null, metadata = {} }) {
    try {
      await this.pool.query(
        `INSERT INTO audit_logs (event_type, entity_type, entity_id, actor_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [eventType, entityType, entityId, actorId, JSON.stringify(metadata)],
      );
      return true;
    } catch (e) {
      // fail-open: ثبت audit نباید عملیات اصلی را بشکند
      console.error('[RBAC][AUDIT] failed to record event:', eventType, e.message);
      return false;
    }
  }

  /** آخرین رویدادهای یک نوع (برای مشاهده در پنل ادمین) */
  async listByEventType(eventType, limit = 50) {
    const { rows } = await this.pool.query(
      `SELECT id, event_type, entity_type, entity_id, actor_id, metadata, created_at
       FROM audit_logs WHERE event_type = $1 ORDER BY created_at DESC LIMIT $2`,
      [eventType, limit],
    );
    return rows;
  }
}

module.exports = AuditRepository;
