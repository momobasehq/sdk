import { endpoint, SessionClient } from "./session.js";
import type { TokenSnapshot } from "./session.js";
import type {
    AdminTransaction,
    AdminUser,
    AnalyticsQuery,
    App,
    AppCredential,
    AuditLog,
    ChargeSchedule,
    CreatedCredential,
    ListOptions,
    PaginatedData,
    PaymentRoute,
    PermissionAudience,
    PermissionList,
    ProviderAccount,
    ProviderBalance,
    ProviderBalanceResult,
    ProviderHealthSnapshot,
    ProviderRegistry,
    Role,
    RoleList,
    RoleRequest,
    RuntimeProvider,
    SystemHealth,
    SystemInfo,
    TransactionAnalytics,
    WorkerState
} from "./types.js";

/** Configures administrator authentication and API access. */
export interface AdminClientOptions {
    baseUrl: string;
    email?: string;
    password?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenSkewSeconds?: number;
    /** Receives token changes so callers can persist or clear a session. */
    onTokenChange?: (token: TokenSnapshot | undefined) => void;
}

/** Calls administrator-authenticated Momobase endpoints. */
export class MomobaseAdminClient extends SessionClient {
    private email?: string;
    private password?: string;
    /** Creates an administrator client. */
    constructor(o: AdminClientOptions) {
        super(o.baseUrl, o.tokenSkewSeconds);
        this.email = o.email;
        this.password = o.password;
        this.onTokenChange = o.onTokenChange;
        if (o.accessToken) this.setAccessToken(o.accessToken, o.refreshToken);
    }
    /** Replaces credentials and clears the current session. */
    setCredentials(email: string, password: string) {
        this.email = email;
        this.password = password;
        this.clearToken();
    }
    /** Restores tokens obtained outside this client. */
    setAccessToken(
        accessToken: string,
        refreshToken?: string,
        expiresInSeconds?: number
    ) {
        const ttl =
            expiresInSeconds === undefined
                ? 0
                : Math.max(expiresInSeconds - this.skew, 1) * 1000;
        this.token = { accessToken, refreshToken, expiresAt: Date.now() + ttl };
        this.onTokenChange?.({ ...this.token });
    }
    /** Authenticates with the configured administrator credentials. */
    authenticate(signal?: AbortSignal) {
        if (!this.email || !this.password)
            return Promise.reject(
                new Error("Admin email and password are required")
            );
        return this.form(
            "/api/admin/token",
            {
                grant_type: "password",
                username: this.email,
                password: this.password
            },
            signal
        );
    }
    /** Refreshes the administrator session or authenticates again. */
    async refresh(signal?: AbortSignal) {
        if (!this.token?.refreshToken) return this.authenticate(signal);
        try {
            return await this.form(
                "/api/admin/token/refresh",
                {
                    grant_type: "refresh_token",
                    refresh_token: this.token.refreshToken
                },
                signal
            );
        } catch {
            this.clearToken();
            return this.authenticate(signal);
        }
    }
    /** Ends the current administrator session. */
    logout() {
        return this.post<unknown>("/api/admin/logout");
    }
    /** Reads system health and runtime state. */
    readonly system = {
        /** Gets runtime metadata. */
        info: () => this.get<SystemInfo>("/api/admin/system/info"),
        /** Gets runtime health. */
        health: () => this.get<SystemHealth>("/api/admin/system/health"),
        /** Lists configured workers. */
        workers: (o?: ListOptions) =>
            this.list<PaginatedData<WorkerState>>("/api/admin/workers", o),
        /** Lists initialized provider runtimes. */
        runtimeProviders: (o?: ListOptions) =>
            this.list<PaginatedData<RuntimeProvider>>(
                "/api/admin/runtime/providers",
                o
            )
    };
    /** Manages permissions and roles. */
    readonly authz = {
        /** Lists assignable permissions. */
        permissions: (audience?: PermissionAudience) =>
            this.get<PermissionList>(
                `/api/admin/permissions${audience ? `?audience=${audience}` : ""}`
            ),
        /** Lists roles. */
        roles: () => this.get<RoleList>("/api/admin/roles"),
        /** Creates a role. */
        createRole: (p: RoleRequest & { name: string }) =>
            this.post<Role>("/api/admin/roles", p),
        /** Replaces a role. */
        updateRole: (name: string, p: RoleRequest) =>
            this.patch<unknown>(endpoint("/api/admin/roles", name), p),
        /** Deletes a custom role. */
        deleteRole: (name: string) =>
            this.delete<unknown>(endpoint("/api/admin/roles", name))
    };
    /** Manages administrators. */
    readonly users = {
        /** Gets the signed-in administrator. */
        me: () => this.get<AdminUser>("/api/admin/me"),
        /** Lists administrators. */
        list: (o?: ListOptions) =>
            this.list<PaginatedData<AdminUser>>("/api/admin/users", o),
        /** Creates an administrator. */
        create: (p: {
            name: string;
            email: string;
            password: string;
            role?: string;
        }) => this.post<AdminUser>("/api/admin/users", p),
        /** Changes an administrator password. */
        changePassword: (id: string, password: string) =>
            this.patch<unknown>(
                endpoint("/api/admin/users", id) + "/password",
                { password }
            ),
        /** Changes an administrator status. */
        changeStatus: (id: string, status: "active" | "inactive") =>
            this.patch<unknown>(endpoint("/api/admin/users", id) + "/status", {
                status
            }),
        /** Reassigns an administrator to another role. */
        changeRole: (id: string, role: string) =>
            this.patch<unknown>(endpoint("/api/admin/users", id) + "/role", {
                role
            })
    };
    /** Manages applications and credentials. */
    readonly apps = {
        /** Lists applications. */
        list: (o?: ListOptions) =>
            this.list<PaginatedData<App>>("/api/admin/apps", o),
        /** Creates an application. */
        create: (p: {
            name: string;
            description?: string;
            environment?: "sandbox" | "production";
            currency: string;
            charges?: ChargeSchedule;
        }) => this.post<App>("/api/admin/apps", p),
        /** Gets an application. */
        get: (id: string) => this.get<App>(endpoint("/api/admin/apps", id)),
        /** Updates an application. */
        update: (
            id: string,
            p: Partial<
                Pick<
                    App,
                    | "name"
                    | "description"
                    | "environment"
                    | "currency"
                    | "charges"
                >
            >
        ) => this.patch<App>(endpoint("/api/admin/apps", id), p),
        /** Changes an application status. */
        changeStatus: (
            id: string,
            status: "active" | "disabled" | "suspended"
        ) =>
            this.patch<unknown>(endpoint("/api/admin/apps", id) + "/status", {
                status
            }),
        /** Lists an application's credentials. */
        credentials: (id: string, o?: ListOptions) =>
            this.list<PaginatedData<AppCredential>>(
                `${endpoint("/api/admin/apps", id)}/credentials`,
                o
            ),
        /** Creates an application credential. */
        createCredential: (
            id: string,
            p: { name?: string; scopes?: string; expires_at?: string }
        ) =>
            this.post<CreatedCredential>(
                endpoint("/api/admin/apps", id) + "/credentials",
                p
            ),
        /** Revokes an application credential. */
        revokeCredential: (id: string, cid: string) =>
            this.patch<unknown>(
                `${endpoint("/api/admin/apps", id)}/credentials/${encodeURIComponent(cid)}/revoke`
            ),
        /** Rotates an application credential. */
        rotateCredential: (id: string, cid: string) =>
            this.post<CreatedCredential>(
                `${endpoint("/api/admin/apps", id)}/credentials/${encodeURIComponent(cid)}/rotate`
            )
    };
    /** Manages provider accounts and runtime status. */
    readonly providers = {
        /** Lists provider accounts. */
        list: (o?: ListOptions) =>
            this.list<PaginatedData<ProviderAccount>>(
                "/api/admin/providers",
                o
            ),
        /** Gets a provider account. */
        get: (id: string) =>
            this.get<ProviderAccount>(
                endpoint("/api/admin/providers/accounts", id)
            ),
        /** Lists provider codes compiled into the server. */
        registry: () =>
            this.get<ProviderRegistry>("/api/admin/providers/registry"),
        /** Creates a provider account. */
        createAccount: (p: {
            provider_code: string;
            name: string;
            environment: "sandbox" | "production";
            country: string;
            currency: string;
            charges?: ChargeSchedule;
            config: Record<string, unknown>;
        }) => this.post<ProviderAccount>("/api/admin/providers/accounts", p),
        /** Updates provider location, currency, and charges. */
        updateSettings: (
            id: string,
            p: { country: string; currency: string; charges: ChargeSchedule }
        ) =>
            this.patch<unknown>(
                endpoint("/api/admin/providers/accounts", id) + "/settings",
                p
            ),
        /** Replaces provider configuration. */
        updateConfig: (id: string, config: Record<string, unknown>) =>
            this.patch<unknown>(
                endpoint("/api/admin/providers/accounts", id) + "/config",
                { config }
            ),
        /** Activates a provider account. */
        activate: (id: string) =>
            this.patch<unknown>(
                endpoint("/api/admin/providers/accounts", id) + "/activate"
            ),
        /** Deactivates a provider account. */
        deactivate: (id: string) =>
            this.patch<unknown>(
                endpoint("/api/admin/providers/accounts", id) + "/deactivate"
            ),
        /** Tests a provider account connection. */
        test: (id: string) =>
            this.post<unknown>(
                endpoint("/api/admin/providers/accounts", id) + "/test"
            ),
        /** Gets one provider balance. */
        balance: (id: string, country?: string) =>
            this.get<ProviderBalance>(
                endpoint("/api/admin/providers/accounts", id) +
                    "/balance" +
                    (country ? `?country=${encodeURIComponent(country)}` : "")
            ),
        /** Lists active provider balances. */
        activeBalances: (o?: ListOptions) =>
            this.list<PaginatedData<ProviderBalanceResult>>(
                "/api/admin/balances/providers",
                o
            ),
        /** Lists provider health snapshots. */
        health: (o?: ListOptions) =>
            this.list<PaginatedData<ProviderHealthSnapshot>>(
                "/api/admin/health/providers",
                o
            )
    };
    /** Manages payment routes. */
    readonly routes = {
        /** Lists payment routes. */
        list: (o?: ListOptions) =>
            this.list<PaginatedData<PaymentRoute>>("/api/admin/routes", o),
        /** Creates a payment route. */
        create: (
            p: Omit<
                PaymentRoute,
                "id" | "provider_name" | "created_at" | "updated_at"
            >
        ) => this.post<PaymentRoute>("/api/admin/routes", p),
        /** Updates route priority and status. */
        update: (id: string, p: { priority: number; active: boolean }) =>
            this.patch<unknown>(endpoint("/api/admin/routes", id), p)
    };
    /** Reads transactions and audit logs. */
    readonly transactions = {
        /** Lists transactions. */
        list: (o?: ListOptions) =>
            this.list<PaginatedData<AdminTransaction>>(
                "/api/admin/transactions",
                o
            ),
        /** Lists audit logs. */
        auditLogs: (o?: ListOptions) =>
            this.list<PaginatedData<AuditLog>>("/api/admin/audit-logs", o)
    };
    /** Reads transaction analytics. */
    readonly analytics = {
        /** Gets bucketed transaction analytics. */
        transactions: (q: AnalyticsQuery = {}) => {
            const search = new URLSearchParams();
            if (q.from) search.set("from", q.from);
            if (q.to) search.set("to", q.to);
            if (q.interval) search.set("interval", q.interval);
            if (q.appId) search.set("app_id", q.appId);
            if (q.providerAccountId)
                search.set("provider_account_id", q.providerAccountId);
            return this.get<TransactionAnalytics>(
                `/api/admin/analytics/transactions${search.size ? `?${search}` : ""}`
            );
        }
    };
}
