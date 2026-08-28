/**
 * Permission.js - Domain Entity
 *
 * یک مجوز (Permission) در سیستم. مجوزها در دیتابیس نگهداری می‌شوند
 * (migration 010) و هیچ مجوزی در کد hardcoded نیست.
 */
class Permission {
  constructor({ id = null, slug, description = null, moduleName }) {
    this.id = id;
    this.slug = slug;
    this.description = description;
    this.moduleName = moduleName;
  }

  /** قاعده نام‌گذاری مجوز: module.action مانند `users.read` */
  static isValidSlug(slug) {
    return typeof slug === 'string' && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(slug);
  }

  isValid() {
    return Permission.isValidSlug(this.slug) && typeof this.moduleName === 'string' && this.moduleName.length > 0;
  }

  toJSON() {
    return { id: this.id, slug: this.slug, description: this.description, moduleName: this.moduleName };
  }
}

module.exports = Permission;
