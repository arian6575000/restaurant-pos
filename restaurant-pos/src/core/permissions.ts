// Permission keys and role definitions. Enforced by the command layer (core/network/parent.ts), never only by hiding screens.

export const PERMISSIONS = [
  'orders.view', 'orders.create', 'orders.update', 'orders.submit', 'orders.cancel', 'orders.discount',
  'orders.markReady', 'orders.markServed', 'orders.close', 'items.void',
  'kitchen.view', 'kitchen.updateStatus',
  'tables.view', 'tables.manage',
  'billing.view', 'payments.record', 'payments.void',
  'reports.view', 'menu.manage', 'settings.manage', 'devices.manage', 'roles.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface RoleDef { id: string; name: string; permissions: Permission[]; builtin: boolean }

export const ROLE_ADMIN = 'role-admin';
export const ROLE_KITCHEN = 'role-kitchen';
export const ROLE_WAITER = 'role-waiter';
export const ROLE_CASHIER = 'role-cashier';

export const BUILTIN_ROLES: Record<string, RoleDef> = {
  [ROLE_ADMIN]: { id: ROLE_ADMIN, name: 'Parent / Administrator', builtin: true, permissions: [...PERMISSIONS] },
  [ROLE_KITCHEN]: {
    id: ROLE_KITCHEN, name: 'Kitchen', builtin: true,
    permissions: ['orders.view', 'kitchen.view', 'kitchen.updateStatus', 'orders.markReady'],
  },
  [ROLE_WAITER]: {
    id: ROLE_WAITER, name: 'Waiter', builtin: true,
    permissions: ['orders.view', 'orders.create', 'orders.update', 'orders.submit', 'orders.markServed', 'tables.view'],
  },
  [ROLE_CASHIER]: {
    id: ROLE_CASHIER, name: 'Cashier', builtin: true,
    permissions: ['orders.view', 'tables.view', 'billing.view', 'payments.record', 'orders.close', 'orders.discount', 'reports.view'],
  },
};

export function isPermission(p: string): p is Permission { return (PERMISSIONS as readonly string[]).includes(p); }

/** Custom roles are stored in the `roles` table; built-ins live in code so every device agrees on them. */
export function permissionsOfRole(roleId: string | null | undefined, custom: Record<string, string[]>): ReadonlySet<Permission> {
  if (!roleId) return new Set();
  const b = BUILTIN_ROLES[roleId];
  if (b) return new Set(b.permissions);
  return new Set((custom[roleId] || []).filter(isPermission));
}
export const can = (perms: ReadonlySet<Permission>, p: Permission): boolean => perms.has(p);
