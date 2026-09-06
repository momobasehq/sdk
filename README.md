<div align=center>

<img width="75" src="https://github.com/momobasehq.png" />

# Momobase SDK

[![npm](https://img.shields.io/npm/v/momobase.svg)](https://www.npmjs.com/package/momobase)
[![Release](https://img.shields.io/github/v/release/momobasehq/sdk.svg)](https://github.com/momobasehq/sdk/releases)
[![SDK](https://github.com/momobasehq/sdk/actions/workflows/build.yml/badge.svg)](https://github.com/momobasehq/sdk/actions/workflows/build.yml)
[![License](https://img.shields.io/npm/l/momobase.svg)](LICENSE.txt)

TypeScript client for the Momobase payment and administration APIs.

</div>

## Install

```sh
npm install momobase
```

## Usage

### Creating a new client instance

There are two clients. `MomobaseClient` authenticates an application with the
OAuth `client_credentials` grant and calls the public payment API.
`MomobaseAdminClient` authenticates an operator with the OAuth `password` grant
and covers the administration API.

```ts
import { MomobaseClient, MomobaseAdminClient } from "momobase";

const mb = new MomobaseClient({
    baseUrl,
    clientId,
    clientSecret,
    tokenSkewSeconds = 30
});

const admin = new MomobaseAdminClient({
    baseUrl,
    email,
    password,
    accessToken,
    refreshToken,
    tokenSkewSeconds = 30,
    onTokenChange
});
```

Both clients authenticate lazily on the first request, cache the token, and
refresh it once when it expires or the API answers `401`. `tokenSkewSeconds`
is how early a token is treated as expired. `onTokenChange` fires on every
token change so an admin session can be persisted and restored.

### Instance methods

> Instance methods manage the session. They do not chain — each returns the
> value described below.

| Method                                                                | Description                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `mb.authenticate(signal?)`                                            | Authenticates with the configured credentials and stores the token. |
| `mb.refresh(signal?)`                                                 | Refreshes the session, falling back to a fresh authentication.      |
| `mb.getToken()`                                                       | Returns a copy of the current session tokens, or `undefined`.       |
| `mb.clearToken()`                                                     | Clears the active session token.                                    |
| `admin.setCredentials(email, password)`                               | Replaces the credentials and clears the current session.            |
| `admin.setAccessToken(accessToken, refreshToken?, expiresInSeconds?)` | Restores tokens obtained outside this client.                       |
| `admin.logout()`                                                      | Ends the current administrator session.                             |

### Request options

Payment calls accept `RequestOptions`; list calls accept `ListOptions`.

```ts
{ idempotencyKey?: string, signal?: AbortSignal }   // RequestOptions
{ page?: number, perPage?: number, signal?: AbortSignal } // ListOptions
```

## Services

> Each service call returns a `Promise` resolving to the unwrapped API data.
> 🔓 marks the application client, 🔐 the administrator client.

### PaymentMethodService

```ts
// Lists the payment methods currently available for routing.
🔓 mb.paymentMethods.list({ serviceType, country } = {}, options = {});
```

### CollectionService

```ts
// Creates a collection (money in).
🔓 mb.collections.create(bodyParams, options = {});
```

### DisbursementService

```ts
// Creates a disbursement (money out).
🔓 mb.disbursements.create(bodyParams, options = {});
```

### TransactionService

```ts
// Returns a single transaction by its id.
🔓 mb.transactions.get(transactionId, options = {});

// Returns a single transaction by the reference the application supplied.
🔓 mb.transactions.getByReference(reference, options = {});

// Returns a paginated transactions list across all applications.
🔐 admin.transactions.list(options = {});

// Returns a paginated audit logs list.
🔐 admin.transactions.auditLogs(options = {});
```

### SystemService

```ts
// Returns runtime metadata (version, uptime, build).
🔐 admin.system.info();

// Returns runtime health.
🔐 admin.system.health();

// Returns a paginated list of the configured background workers.
🔐 admin.system.workers(options = {});

// Returns a paginated list of the initialized provider runtimes.
🔐 admin.system.runtimeProviders(options = {});
```

### AuthzService

```ts
// Lists assignable permissions, optionally for one audience ("admin" | "app").
🔐 admin.authz.permissions(audience?);

// Lists roles.
🔐 admin.authz.roles();

// Creates a role.
🔐 admin.authz.createRole(bodyParams);

// Replaces a role.
🔐 admin.authz.updateRole(name, bodyParams);

// Deletes a custom role.
🔐 admin.authz.deleteRole(name);
```

### UserService

```ts
// Returns the signed-in administrator.
🔐 admin.users.me();

// Returns a paginated administrators list.
🔐 admin.users.list(options = {});

// Creates an administrator.
🔐 admin.users.create({ name, email, password, role });

// Changes an administrator password.
🔐 admin.users.changePassword(userId, password);

// Changes an administrator status ("active" | "inactive").
🔐 admin.users.changeStatus(userId, status);

// Reassigns an administrator to another role.
🔐 admin.users.changeRole(userId, role);
```

### AppService

```ts
// Returns a paginated applications list.
🔐 admin.apps.list(options = {});

// Creates an application.
🔐 admin.apps.create({ name, description, environment, currency, charges });

// Returns a single application by its id.
🔐 admin.apps.get(appId);

// Updates an application.
🔐 admin.apps.update(appId, bodyParams);

// Changes an application status ("active" | "disabled" | "suspended").
🔐 admin.apps.changeStatus(appId, status);

// Returns a paginated list of an application's credentials.
🔐 admin.apps.credentials(appId, options = {});

// Creates an application credential. The secret is returned only once.
🔐 admin.apps.createCredential(appId, { name, scopes, expires_at });

// Revokes an application credential.
🔐 admin.apps.revokeCredential(appId, credentialId);

// Rotates an application credential and returns the new secret.
🔐 admin.apps.rotateCredential(appId, credentialId);
```

### ProviderService

```ts
// Returns a paginated provider accounts list.
🔐 admin.providers.list(options = {});

// Returns a single provider account by its id.
🔐 admin.providers.get(accountId);

// Lists the provider codes compiled into the server.
🔐 admin.providers.registry();

// Creates a provider account.
🔐 admin.providers.createAccount({
    provider_code, name, environment, country, currency, charges, config
});

// Updates provider location, currency, and charges.
🔐 admin.providers.updateSettings(accountId, { country, currency, charges });

// Replaces provider configuration.
🔐 admin.providers.updateConfig(accountId, config);

// Activates a provider account.
🔐 admin.providers.activate(accountId);

// Deactivates a provider account.
🔐 admin.providers.deactivate(accountId);

// Tests a provider account connection.
🔐 admin.providers.test(accountId);

// Returns one provider balance, optionally for a single country.
🔐 admin.providers.balance(accountId, country?);

// Returns a paginated list of the active provider balances.
🔐 admin.providers.activeBalances(options = {});

// Returns a paginated list of provider health snapshots.
🔐 admin.providers.health(options = {});
```

### RouteService

```ts
// Returns a paginated payment routes list.
🔐 admin.routes.list(options = {});

// Creates a payment route.
🔐 admin.routes.create(bodyParams);

// Updates route priority and status.
🔐 admin.routes.update(routeId, { priority, active });
```

### AnalyticsService

```ts
// Returns bucketed transaction analytics.
🔐 admin.analytics.transactions({ from, to, interval, appId, providerAccountId } = {});
```

## Errors

Every non-successful response rejects with a `MomobaseAPIError` carrying the
HTTP `status`, the stable Momobase `code`, and the parsed `body`.

```ts
import { MomobaseAPIError } from "momobase";

try {
    await mb.collections.create(payload);
} catch (err) {
    if (err instanceof MomobaseAPIError) console.error(err.status, err.code);
}
```

## Permissions

`AdminPermissions` and `AppScopes` are typed maps of the known permission
codes, for autocomplete and UI gates. `permitted` tests a granted list against
a required code, honouring the `PermissionWildcard`.

```ts
import { AdminPermissions, permitted } from "momobase";

permitted(role.permissions, AdminPermissions.appsCreate);
```

## Development

```sh
pnpm install

pnpm run typecheck   # tsc --noEmit
pnpm run lint        # eslint
pnpm run format      # prettier --write
pnpm run build       # tsc -> dist
```

## Documentation

See the [Momobase SDK documentation](https://momobasehq.github.io/sdk/) for
authentication, payment flows, administration, and the complete API.

## License

[MIT](LICENSE.txt)
