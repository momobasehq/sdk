/** Known administrator permission codes for autocomplete and UI gates. */
export const AdminPermissions = {
	systemRead: "system:read",
	transactionsRead: "transactions:read",
	auditRead: "audit:read",
	usersRead: "users:read",
	usersCreate: "users:create",
	usersUpdate: "users:update",
	rolesRead: "roles:read",
	rolesCreate: "roles:create",
	rolesUpdate: "roles:update",
	rolesDelete: "roles:delete",
	appsRead: "apps:read",
	appsCreate: "apps:create",
	appsUpdate: "apps:update",
	appsTest: "apps:test",
	credentialsRead: "credentials:read",
	credentialsCreate: "credentials:create",
	credentialsUpdate: "credentials:update",
	providersRead: "providers:read",
	providersCreate: "providers:create",
	providersUpdate: "providers:update",
	providersTest: "providers:test",
	balancesRead: "balances:read",
	routesRead: "routes:read",
	routesCreate: "routes:create",
	routesUpdate: "routes:update",
} as const;

/** The scopes an application credential may hold. */
export const AppScopes = {
	collectionsCreate: "collections:create",
	disbursementsCreate: "disbursements:create",
	transactionsRead: "transactions:read",
} as const;

/** Grants every permission in an audience. */
export const PermissionWildcard = "*";

/** A permission an administrator's role may grant. */
export type AdminPermission =
	(typeof AdminPermissions)[keyof typeof AdminPermissions];
/** A scope an application credential may hold. */
export type AppScope = (typeof AppScopes)[keyof typeof AppScopes];

/** Accepts known codes while preserving autocomplete for newer server codes. */
export type PermissionCode = AdminPermission | AppScope | (string & {});

/** Reports whether held permissions satisfy a required code. */
export function permitted(
	held: readonly string[] | undefined,
	required: PermissionCode,
) {
	if (!held) return false;
	return held.includes(required) || held.includes(PermissionWildcard);
}
