import { MomobaseAPIError } from "./errors.js";
import type {
	AdminTransaction,
	AdminUser,
	AnalyticsQuery,
	APIEnvelope,
	App,
	AppCredential,
	AuditLog,
	ChargeSchedule,
	CreateCollectionRequest,
	CreateDisbursementRequest,
	CreatePaymentResponse,
	CreatedCredential,
	ListOptions,
	AvailablePaymentMethods,
	OAuthTokenResponse,
	PaginatedData,
	PaymentRoute,
	ProviderAccount,
	ProviderBalance,
	ProviderBalanceResult,
	ProviderHealthSnapshot,
	ProviderRegistry,
	RequestOptions,
	PermissionAudience,
	PermissionList,
	Role,
	RoleList,
	RoleRequest,
	RuntimeProvider,
	ServiceType,
	SystemHealth,
	SystemInfo,
	Transaction,
	TransactionAnalytics,
	WorkerState,
} from "./types.js";

/** Configures application authentication and API access. */
export interface MomobaseClientOptions {
	baseUrl: string;
	clientId: string;
	clientSecret: string;
	tokenSkewSeconds?: number;
}
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
/** The current session tokens and the epoch milliseconds at which they expire. */
export interface TokenSnapshot {
	accessToken: string;
	refreshToken?: string;
	expiresAt: number;
}
type Method = "GET" | "POST" | "PATCH" | "DELETE";
type CachedToken = TokenSnapshot;

const query = (o?: ListOptions) => {
	const q = new URLSearchParams();
	if (o?.page) q.set("page", String(o.page));
	if (o?.perPage) q.set("per_page", String(o.perPage));
	return q.size ? `?${q}` : "";
};
const endpoint = (path: string, id: string) =>
	`${path}/${encodeURIComponent(id)}`;
async function unwrap<T>(r: Response): Promise<T> {
	if (!r.ok) throw await MomobaseAPIError.fromResponse(r);
	const body = (await r.json()) as APIEnvelope<T>;
	if (body && typeof body === "object" && "success" in body) {
		if (!body.success)
			throw new MomobaseAPIError(
				r.status,
				body.error?.code ?? "API_ERROR",
				body.error?.message ?? body.message ?? "API error",
				body,
			);
		return body.data as T;
	}
	return body as T;
}
function cached(t: OAuthTokenResponse, skew: number): CachedToken {
	return {
		accessToken: t.access_token,
		refreshToken: t.refresh_token,
		expiresAt: Date.now() + Math.max(t.expires_in - skew, 1) * 1000,
	};
}
function validatePayment(
	_kind: "collection" | "disbursement",
	p: CreateCollectionRequest | CreateDisbursementRequest,
) {
	// The account stays opaque here: what a valid one looks like is the provider's to
	// decide, so the client only checks what the API requires of every payment.
	if (!p.payment_method) throw new Error("payment_method is required");
	if (!p.account) throw new Error("account is required");
	if (!p.country || p.country.length !== 2)
		throw new Error("country must be a 2-letter ISO code");
}

abstract class SessionClient {
	protected readonly baseUrl: string;
	protected readonly skew: number;
	protected token?: CachedToken;
	protected onTokenChange?: (token: TokenSnapshot | undefined) => void;
	private refreshPromise?: Promise<OAuthTokenResponse>;
	constructor(baseUrl: string, skew = 30) {
		this.baseUrl = baseUrl.replace(/\/$/, "");
		this.skew = skew;
	}
	protected abstract authenticate(
		signal?: AbortSignal,
	): Promise<OAuthTokenResponse>;
	protected abstract refresh(
		signal?: AbortSignal,
	): Promise<OAuthTokenResponse>;
	/** Clears the active session token. */
	clearToken() {
		this.token = undefined;
		this.onTokenChange?.(undefined);
	}
	/** Returns the current session tokens, or undefined when there is no session. */
	getToken(): TokenSnapshot | undefined {
		return this.token ? { ...this.token } : undefined;
	}
	protected setToken(t: OAuthTokenResponse) {
		this.token = cached(t, this.skew);
		this.onTokenChange?.({ ...this.token });
		return t;
	}
	private async refreshOnce(signal?: AbortSignal) {
		if (this.refreshPromise) return this.refreshPromise;
		const refresh = this.refresh(signal);
		this.refreshPromise = refresh;
		try {
			return await refresh;
		} finally {
			if (this.refreshPromise === refresh)
				this.refreshPromise = undefined;
		}
	}
	protected async bearer(signal?: AbortSignal) {
		if (!this.token) await this.authenticate(signal);
		else if (this.token.expiresAt <= Date.now())
			await this.refreshOnce(signal);
		return this.token!.accessToken;
	}
	private send(
		method: Method,
		path: string,
		payload: unknown,
		options: RequestOptions,
		accessToken: string,
	) {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${accessToken}`,
		};
		if (method !== "GET") headers["Content-Type"] = "application/json";
		if (options.idempotencyKey)
			headers["Idempotency-Key"] = options.idempotencyKey;
		return fetch(this.baseUrl + path, {
			method,
			headers,
			body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
			signal: options.signal,
		});
	}
	protected async request<T>(
		method: Method,
		path: string,
		payload?: unknown,
		options: RequestOptions = {},
	) {
		const accessToken = await this.bearer(options.signal);
		let response = await this.send(
			method,
			path,
			payload,
			options,
			accessToken,
		);
		if (response.status === 401) {
			// Another request may already have refreshed while this one was in flight. Only
			// rotate again when the rejected access token is still the active token.
			if (this.token?.accessToken === accessToken)
				await this.refreshOnce(options.signal);
			response = await this.send(
				method,
				path,
				payload,
				options,
				await this.bearer(options.signal),
			);
		}
		return unwrap<T>(response);
	}
	protected get<T>(path: string, options?: RequestOptions) {
		return this.request<T>("GET", path, undefined, options);
	}
	protected post<T>(
		path: string,
		payload?: unknown,
		options?: RequestOptions,
	) {
		return this.request<T>("POST", path, payload, options);
	}
	protected patch<T>(
		path: string,
		payload?: unknown,
		options?: RequestOptions,
	) {
		return this.request<T>("PATCH", path, payload, options);
	}
	protected delete<T>(path: string, options?: RequestOptions) {
		return this.request<T>("DELETE", path, undefined, options);
	}
	protected async form(
		path: string,
		values: Record<string, string>,
		signal?: AbortSignal,
	) {
		const r = await fetch(this.baseUrl + path, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams(values),
			signal,
		});
		if (!r.ok) throw await MomobaseAPIError.fromResponse(r);
		return this.setToken((await r.json()) as OAuthTokenResponse);
	}
}

/** Calls application-authenticated Momobase endpoints. */
export class MomobaseClient extends SessionClient {
	/** Creates an application client. */
	constructor(private readonly options: MomobaseClientOptions) {
		super(options.baseUrl, options.tokenSkewSeconds);
	}
	/** Authenticates with the configured application credential. */
	authenticate(signal?: AbortSignal) {
		return this.form(
			"/api/v1/token",
			{
				grant_type: "client_credentials",
				client_id: this.options.clientId,
				client_secret: this.options.clientSecret,
			},
			signal,
		);
	}
	/** Refreshes the application session or authenticates again. */
	async refresh(signal?: AbortSignal) {
		if (!this.token?.refreshToken) return this.authenticate(signal);
		try {
			return await this.form(
				"/api/v1/token/refresh",
				{
					grant_type: "refresh_token",
					refresh_token: this.token.refreshToken,
				},
				signal,
			);
		} catch {
			this.clearToken();
			return this.authenticate(signal);
		}
	}
	/** Discovers payment methods currently available for routing. */
	readonly paymentMethods = {
		/** Lists available payment methods. */
		list: (
			q: { serviceType?: ServiceType; country?: string } = {},
			o: RequestOptions = {},
		) => {
			const search = new URLSearchParams();
			if (q.serviceType) search.set("service_type", q.serviceType);
			if (q.country) search.set("country", q.country);
			return this.get<AvailablePaymentMethods>(
				`/api/v1/payment-methods${search.size ? `?${search}` : ""}`,
				o,
			);
		},
	};
	/** Creates collection payments. */
	readonly collections = {
		/** Creates a collection. */
		create: (p: CreateCollectionRequest, o: RequestOptions = {}) => {
			validatePayment("collection", p);
			return this.post<CreatePaymentResponse>(
				"/api/v1/collections",
				p,
				o,
			);
		},
	};
	/** Creates disbursement payments. */
	readonly disbursements = {
		/** Creates a disbursement. */
		create: (p: CreateDisbursementRequest, o: RequestOptions = {}) => {
			validatePayment("disbursement", p);
			return this.post<CreatePaymentResponse>(
				"/api/v1/disbursements",
				p,
				o,
			);
		},
	};
	/** Reads application transactions. */
	readonly transactions = {
		/** Gets a transaction by ID. */
		get: (id: string, o: RequestOptions = {}) =>
			this.get<Transaction>(endpoint("/api/v1/transactions", id), o),
		/** Gets a transaction by application reference. */
		getByReference: (ref: string, o: RequestOptions = {}) =>
			this.get<Transaction>(
				endpoint("/api/v1/transactions/by-reference", ref),
				o,
			),
	};
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
		expiresInSeconds?: number,
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
				new Error("Admin email and password are required"),
			);
		return this.form(
			"/api/admin/token",
			{
				grant_type: "password",
				username: this.email,
				password: this.password,
			},
			signal,
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
					refresh_token: this.token.refreshToken,
				},
				signal,
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
			this.get<PaginatedData<WorkerState>>(
				`/api/admin/workers${query(o)}`,
			),
		/** Lists initialized provider runtimes. */
		runtimeProviders: (o?: ListOptions) =>
			this.get<PaginatedData<RuntimeProvider>>(
				`/api/admin/runtime/providers${query(o)}`,
			),
	};
	/** Manages permissions and roles. */
	readonly authz = {
		/** Lists assignable permissions. */
		permissions: (audience?: PermissionAudience) =>
			this.get<PermissionList>(
				`/api/admin/permissions${audience ? `?audience=${audience}` : ""}`,
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
			this.delete<unknown>(endpoint("/api/admin/roles", name)),
	};
	/** Manages administrators. */
	readonly users = {
		/** Gets the signed-in administrator. */
		me: () => this.get<AdminUser>("/api/admin/me"),
		/** Lists administrators. */
		list: (o?: ListOptions) =>
			this.get<PaginatedData<AdminUser>>(`/api/admin/users${query(o)}`),
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
				{ password },
			),
		/** Changes an administrator status. */
		changeStatus: (id: string, status: "active" | "inactive") =>
			this.patch<unknown>(endpoint("/api/admin/users", id) + "/status", {
				status,
			}),
		/** Reassigns an administrator to another role. */
		changeRole: (id: string, role: string) =>
			this.patch<unknown>(endpoint("/api/admin/users", id) + "/role", {
				role,
			}),
	};
	/** Manages applications and credentials. */
	readonly apps = {
		/** Lists applications. */
		list: (o?: ListOptions) =>
			this.get<PaginatedData<App>>(`/api/admin/apps${query(o)}`),
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
			>,
		) => this.patch<App>(endpoint("/api/admin/apps", id), p),
		/** Changes an application status. */
		changeStatus: (
			id: string,
			status: "active" | "disabled" | "suspended",
		) =>
			this.patch<unknown>(endpoint("/api/admin/apps", id) + "/status", {
				status,
			}),
		/** Lists an application's credentials. */
		credentials: (id: string, o?: ListOptions) =>
			this.get<PaginatedData<AppCredential>>(
				`${endpoint("/api/admin/apps", id)}/credentials${query(o)}`,
			),
		/** Creates an application credential. */
		createCredential: (
			id: string,
			p: { name?: string; scopes?: string; expires_at?: string },
		) =>
			this.post<CreatedCredential>(
				endpoint("/api/admin/apps", id) + "/credentials",
				p,
			),
		/** Revokes an application credential. */
		revokeCredential: (id: string, cid: string) =>
			this.patch<unknown>(
				`${endpoint("/api/admin/apps", id)}/credentials/${encodeURIComponent(cid)}/revoke`,
			),
		/** Rotates an application credential. */
		rotateCredential: (id: string, cid: string) =>
			this.post<CreatedCredential>(
				`${endpoint("/api/admin/apps", id)}/credentials/${encodeURIComponent(cid)}/rotate`,
			),
	};
	/** Manages provider accounts and runtime status. */
	readonly providers = {
		/** Lists provider accounts. */
		list: (o?: ListOptions) =>
			this.get<PaginatedData<ProviderAccount>>(
				`/api/admin/providers${query(o)}`,
			),
		/** Gets a provider account. */
		get: (id: string) =>
			this.get<ProviderAccount>(
				endpoint("/api/admin/providers/accounts", id),
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
			p: { country: string; currency: string; charges: ChargeSchedule },
		) =>
			this.patch<unknown>(
				endpoint("/api/admin/providers/accounts", id) + "/settings",
				p,
			),
		/** Replaces provider configuration. */
		updateConfig: (id: string, config: Record<string, unknown>) =>
			this.patch<unknown>(
				endpoint("/api/admin/providers/accounts", id) + "/config",
				{ config },
			),
		/** Activates a provider account. */
		activate: (id: string) =>
			this.patch<unknown>(
				endpoint("/api/admin/providers/accounts", id) + "/activate",
			),
		/** Deactivates a provider account. */
		deactivate: (id: string) =>
			this.patch<unknown>(
				endpoint("/api/admin/providers/accounts", id) + "/deactivate",
			),
		/** Tests a provider account connection. */
		test: (id: string) =>
			this.post<unknown>(
				endpoint("/api/admin/providers/accounts", id) + "/test",
			),
		/** Gets one provider balance. */
		balance: (id: string, country?: string) =>
			this.get<ProviderBalance>(
				endpoint("/api/admin/providers/accounts", id) +
					"/balance" +
					(country ? `?country=${encodeURIComponent(country)}` : ""),
			),
		/** Lists active provider balances. */
		activeBalances: (o?: ListOptions) =>
			this.get<PaginatedData<ProviderBalanceResult>>(
				`/api/admin/balances/providers${query(o)}`,
			),
		/** Lists provider health snapshots. */
		health: (o?: ListOptions) =>
			this.get<PaginatedData<ProviderHealthSnapshot>>(
				`/api/admin/health/providers${query(o)}`,
			),
	};
	/** Manages payment routes. */
	readonly routes = {
		/** Lists payment routes. */
		list: (o?: ListOptions) =>
			this.get<PaginatedData<PaymentRoute>>(
				`/api/admin/routes${query(o)}`,
			),
		/** Creates a payment route. */
		create: (
			p: Omit<
				PaymentRoute,
				"id" | "provider_name" | "created_at" | "updated_at"
			>,
		) => this.post<PaymentRoute>("/api/admin/routes", p),
		/** Updates route priority and status. */
		update: (id: string, p: { priority: number; active: boolean }) =>
			this.patch<unknown>(endpoint("/api/admin/routes", id), p),
	};
	/** Reads transactions and audit logs. */
	readonly transactions = {
		/** Lists transactions. */
		list: (o?: ListOptions) =>
			this.get<PaginatedData<AdminTransaction>>(
				`/api/admin/transactions${query(o)}`,
			),
		/** Lists audit logs. */
		auditLogs: (o?: ListOptions) =>
			this.get<PaginatedData<AuditLog>>(
				`/api/admin/audit-logs${query(o)}`,
			),
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
				`/api/admin/analytics/transactions${search.size ? `?${search}` : ""}`,
			);
		},
	};
}
