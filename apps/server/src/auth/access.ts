import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, ownerAc } from "better-auth/plugins/organization/access";

/**
 * Permission statements for OpenPax. Resources map to what staff can do in a
 * restaurant; the Better Auth defaults (organization, member, invitation,
 * team, ac) are kept so the organization plugin keeps working.
 */
export const statement = {
  ...defaultStatements,
  restaurant: ["create", "read", "update", "delete"],
  service: ["read", "create", "update", "delete"],
  booking: ["read", "create", "update", "cancel", "override_capacity"],
  customer: ["read", "update", "delete", "export"],
  settings: ["read", "update"],
  apiKey: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...ownerAc.statements,
  restaurant: ["create", "read", "update", "delete"],
  service: ["read", "create", "update", "delete"],
  booking: ["read", "create", "update", "cancel", "override_capacity"],
  customer: ["read", "update", "delete", "export"],
  settings: ["read", "update"],
  apiKey: ["create", "read", "update", "delete"],
});

export const manager = ac.newRole({
  organization: [],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: [],
  ac: ["read"],
  restaurant: ["read", "update"],
  service: ["read", "create", "update", "delete"],
  booking: ["read", "create", "update", "cancel", "override_capacity"],
  customer: ["read", "update", "delete", "export"],
  settings: ["read", "update"],
  apiKey: ["read"],
});

export const staff = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
  restaurant: ["read"],
  service: ["read"],
  booking: ["read", "create", "update", "cancel"],
  customer: ["read", "update"],
  settings: ["read"],
  apiKey: [],
});

export const roles = { owner, manager, staff } as const;
export type RoleName = keyof typeof roles;

export type Permissions = {
  [K in keyof typeof statement]?: readonly (typeof statement)[K][number][];
};

export function roleHasPermission(role: string, permissions: Permissions): boolean {
  const def = roles[role as RoleName];
  if (!def) return false;
  return def.authorize(permissions as never).success;
}
