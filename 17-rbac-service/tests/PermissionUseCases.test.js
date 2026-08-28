/**
 * PermissionUseCases.test.js - تست واحد منطق مجوزدهی (بدون دیتابیس)
 */
/**
 * PermissionUseCases.test.js - تست واحد منطق مجوزدهی (بدون دیتابیس)
 */
const AuthorizationService = require('../domain/services/AuthorizationService');
const Permission = require('../domain/entities/Permission');


describe('RBAC Domain Logic', () => {
  const svc = new AuthorizationService();

  test('roles list contains all architecture roles', () => {
    expect(svc.listRoles()).toEqual(expect.arrayContaining(['passenger', 'driver', 'provider', 'courier', 'seller', 'advertiser', 'admin', 'super_admin']));
  });

  test('super_admin bypasses permission checks', () => {
    expect(svc.isAllowed({ role: 'super_admin', permission: 'anything.at.all', rolePermissions: [] })).toBe(true);
  });

  test('admin with mapped permission is allowed', () => {
    expect(svc.isAllowed({ role: 'admin', permission: 'users.read', rolePermissions: ['users.read'] })).toBe(true);
  });

  test('admin without mapped permission is denied', () => {
    expect(svc.isAllowed({ role: 'admin', permission: 'users.delete', rolePermissions: ['users.read'] })).toBe(false);
  });

  test('unknown role is always denied', () => {
    expect(svc.isAllowed({ role: 'hacker', permission: 'users.read', rolePermissions: ['users.read'] })).toBe(false);
    expect(svc.isAllowed({ role: undefined, permission: 'users.read', rolePermissions: ['users.read'] })).toBe(false);
  });

  test('passenger cannot use admin permissions', () => {
    expect(svc.isAllowed({ role: 'passenger', permission: 'rbac.manage', rolePermissions: [] })).toBe(false);
  });

  test('permission slug validation', () => {
    expect(Permission.isValidSlug('users.read')).toBe(true);
    expect(Permission.isValidSlug('rbac.manage')).toBe(true);
    expect(Permission.isValidSlug('invalid')).toBe(false);
    expect(Permission.isValidSlug('UPPER.CASE')).toBe(false);
    expect(Permission.isValidSlug('')).toBe(false);
    expect(Permission.isValidSlug(null)).toBe(false);
  });
});
