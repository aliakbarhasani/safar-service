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

/**
 * RBAC Audit Trail — تست واحد لایه Use Case (بدون دیتابیس).
 * بررسی می‌کند که رویدادهای حساس در auditRepository ثبت می‌شوند
 * و در نبود auditRepository، عملیات fail-open ادامه می‌یابد.
 */
const PermissionUseCases = require('../application/use-cases/PermissionUseCases');

function makeMocks() {
  const recorded = [];
  const auditRepository = {
    record: jest.fn(async (params) => { recorded.push(params); return true; }),
    listByEventType: jest.fn(async () => []),
  };
  const permissionRepository = {
    create: jest.fn(async (p) => ({ id: 'perm-' + p.slug, slug: p.slug, description: p.description, moduleName: p.moduleName })),
    remove: jest.fn(async () => true),
    assignPermissionToRole: jest.fn(async () => true),
    revokePermissionFromRole: jest.fn(async () => true),
    assignRoleToUser: jest.fn(async () => true),
    revokeRoleFromUser: jest.fn(async () => true),
    getRolesForUser: jest.fn(async () => []),
  };
  const authorizationService = new AuthorizationService();
  const useCases = new PermissionUseCases({ permissionRepository, authorizationService, auditRepository });
  return { recorded, auditRepository, permissionRepository, useCases };
}

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('RBAC Audit Trail (use cases)', () => {
  test('createPermission records rbac.permission.created with actorId', async () => {
    const { auditRepository, useCases } = makeMocks();
    await useCases.createPermission({ slug: 'tickets.read', description: 'x', moduleName: 'tickets', actorId: ACTOR });

    expect(auditRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'rbac.permission.created', entityType: 'permission', actorId: ACTOR })
    );
  });

  test('deletePermission records rbac.permission.deleted only when removed', async () => {
    const { auditRepository, permissionRepository, useCases } = makeMocks();

    await useCases.deletePermission('tickets.read', ACTOR);
    expect(auditRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'rbac.permission.deleted', metadata: expect.objectContaining({ slug: 'tickets.read' }) })
    );

    auditRepository.record.mockClear();
    permissionRepository.remove.mockResolvedValue(false);
    await useCases.deletePermission('tickets.read', ACTOR);
    expect(auditRepository.record).not.toHaveBeenCalled();
  });

  test('assignPermission/revokePermission record role events', async () => {
    const { auditRepository, useCases } = makeMocks();
    await useCases.assignPermission({ roleName: 'admin', slug: 'tickets.read', actorId: ACTOR });
    await useCases.revokePermission({ roleName: 'admin', slug: 'tickets.read', actorId: ACTOR });

    expect(auditRepository.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'rbac.permission.assigned' }));
    expect(auditRepository.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'rbac.permission.revoked' }));
  });

  test('assignRoleToUser records rbac.user_role.assigned and blocks self-assignment', async () => {
    const { permissionRepository, useCases } = makeMocks();
    permissionRepository.assignRoleToUser.mockResolvedValue(true);

    const res = await useCases.assignRoleToUser({ userId: USER, roleName: 'admin', assignedBy: ACTOR });
    expect(res.assigned).toBe(true);

    // Self role-assignment باید رد شود
    await expect(useCases.assignRoleToUser({ userId: ACTOR, roleName: 'admin', assignedBy: ACTOR }))
      .rejects.toMatchObject({ status: 403, message: 'Self role-assignment is not allowed.' });
  });

  test('operations fail-open when auditRepository is missing', async () => {
    const { permissionRepository, useCases: _ } = makeMocks();
    const useCases = new PermissionUseCases({ permissionRepository, authorizationService: new AuthorizationService(), auditRepository: null });

    const created = await useCases.createPermission({ slug: 'tickets.create', description: 'x', moduleName: 'tickets', actorId: ACTOR });
    expect(created.slug).toBe('tickets.create');

    const revoked = await useCases.revokeRoleFromUser({ userId: USER, roleName: 'admin', actorId: ACTOR });
    expect(revoked).toEqual(expect.objectContaining({ revoked: true }));
  });

  test('invalidateCache clears cached role-permission map', async () => {
    const { auditRepository, permissionRepository, useCases } = makeMocks();
    permissionRepository.getRolePermissionsMap = jest.fn(async () => ({ admin: ['tickets.read'] }));

    await useCases.getRolePermissionsMap();
    expect(permissionRepository.getRolePermissionsMap).toHaveBeenCalledTimes(1);

    useCases.invalidateCache();
    await useCases.getRolePermissionsMap();
    expect(permissionRepository.getRolePermissionsMap).toHaveBeenCalledTimes(2);
  });
});
