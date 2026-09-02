/** Payment rails accepted by Momobase. */
export const PaymentMethods = [
	"momo",
	"card",
	"bank_transfer",
	"wallet",
] as const;
/** One supported payment rail. */
export type PaymentMethod = (typeof PaymentMethods)[number];
/** A collection or disbursement operation. */
export type ServiceType = "collection" | "disbursement";
/** A payment transaction lifecycle state. */
export type TransactionStatus =
	| "pending"
	| "processing"
	| "succeeded"
	| "failed"
	| "unknown"
	| "cancelled"
	| "expired";
/** A flat or percentage charge calculation. */
export type ChargeType = "flat" | "percentage";
/** Defines one charge value and calculation type. */
export interface ChargeRule {
	type: ChargeType;
	value: number;
}
/** Defines collection and disbursement charges. */
export interface ChargeSchedule {
	collection: ChargeRule;
	disbursement: ChargeRule;
}

/** Describes an API error. */
export interface APIError {
	code: string;
	message: string;
}
/** Wraps every Momobase API response. */
export interface APIEnvelope<T = unknown> {
	success: boolean;
	data?: T;
	error?: APIError;
	message?: string;
}
/** Contains one page of API results. */
export interface PaginatedData<T> {
	page: number;
	total: number;
	items: T[];
	count: number;
}
/** Controls paginated list requests. */
export interface ListOptions {
	page?: number;
	perPage?: number;
	signal?: AbortSignal;
}
/** Controls an individual API request. */
export interface RequestOptions {
	idempotencyKey?: string;
	signal?: AbortSignal;
}

/** Describes a payment customer or recipient. */
export interface PartyPayload {
	name?: string;
	email?: string;
}
/** Describes one currently routable payment method. */
export interface AvailablePaymentMethod {
	service_type: ServiceType;
	payment_method: PaymentMethod;
}
/** Contains currently routable payment methods. */
export interface AvailablePaymentMethods {
	items: AvailablePaymentMethod[];
	count: number;
}
/** The payment payload is flat, matching the order a checkout collects it in:
 * `payment_method` and `scheme` come from the method the user picked, and `account`
 * plus `metadata` are the details they entered.
 *
 * `account` is provider-specific — a mobile number, bank account, card token, or
 * wallet address — and is validated by the provider the request routes to, not by
 * the engine. `scheme` is likewise free-form; the provider interprets it. */
interface PaymentRequest {
	payment_method: PaymentMethod;
	scheme?: string;
	account: string;
	amount: number;
	currency: string;
	country: string;
	reference: string;
	description?: string;
	metadata?: Record<string, unknown>;
}
/** Creates a collection payment. */
export interface CreateCollectionRequest extends PaymentRequest {
	customer?: PartyPayload;
}
/** Creates a disbursement payment. */
export interface CreateDisbursementRequest extends PaymentRequest {
	recipient?: PartyPayload;
}
/** Describes a newly created payment. */
export interface CreatePaymentResponse {
	transaction_id: string;
	reference: string;
	service_type: ServiceType;
	payment_method: PaymentMethod;
	status: TransactionStatus;
	selected_provider: string;
	provider_reference: string;
	platform_fee: number;
	message: string;
}
/** Describes an application-visible transaction. */
export interface Transaction {
	id: string;
	app_id: string;
	service_type: ServiceType;
	payment_method: PaymentMethod;
	amount: number;
	currency: string;
	country?: string;
	reference: string;
	idempotency_key: string;
	status: TransactionStatus;
	selected_route_id?: string;
	selected_provider_account_id?: string;
	provider_reference?: string;
	customer_account?: string;
	customer_email?: string;
	customer_name?: string;
	description?: string;
	platform_fee: number;
	created_at: string;
	updated_at: string;
}
/** Describes a transaction with administrator fields. */
export interface AdminTransaction extends Transaction {
	provider_fee: number;
	reconciliation_attempts: number;
	last_reconciled_at?: string;
	next_reconcile_at?: string;
}
/** Contains OAuth access and refresh tokens. */
export interface OAuthTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token?: string;
	scope?: string;
	app_id?: string;
	app_name?: string;
	credential_id?: string;
	client_id?: string;
}

/** Identifies an administrator or application permission audience. */
export type PermissionAudience = "admin" | "app";
/** Describes one server permission. */
export interface Permission {
	id: string;
	code: string;
	audience: PermissionAudience;
	description: string;
	created_at: string;
	updated_at: string;
}
/** Contains the permission catalogue. */
export interface PermissionList {
	items: Permission[];
	count: number;
}
/** Describes a named set of administrator permissions. */
export interface Role {
	id: string;
	name: string;
	description: string;
	system: boolean;
	permissions: Permission[];
	created_at: string;
	updated_at: string;
}
/** Contains available administrator roles. */
export interface RoleList {
	items: Role[];
	count: number;
}
/** Creates or replaces a role. */
export interface RoleRequest {
	name?: string;
	description?: string;
	permissions: string[];
}
/** Describes an administrator and effective permissions. */
export interface AdminUser {
	id: string;
	name: string;
	email: string;
	role: string;
	status: string;
	permissions?: string[];
	created_at: string;
	updated_at: string;
}
/** Describes a Momobase application. */
export interface App {
	id: string;
	name: string;
	description: string;
	status: string;
	environment: string;
	currency: string;
	charges: ChargeSchedule;
	created_by?: string;
	created_at: string;
	updated_at: string;
}
/** Describes an application OAuth credential. */
export interface AppCredential {
	id: string;
	app_id: string;
	name: string;
	client_id: string;
	status: string;
	scopes: string;
	last_used_at?: string;
	expires_at?: string;
	created_by?: string;
	created_at: string;
	updated_at: string;
}
/** Returns a newly created credential and its one-time secret. */
export interface CreatedCredential {
	credential: AppCredential;
	client_secret: string;
}
/** Describes a configured provider account. */
export interface ProviderAccount {
	id: string;
	provider_code: string;
	name: string;
	environment: string;
	country: string;
	currency: string;
	charges: ChargeSchedule;
	active: boolean;
	config_version: number;
	config_hash: string;
	created_at: string;
	updated_at: string;
}
/** Describes one service and payment-method capability. */
export interface ProviderCapability {
	service_type: ServiceType;
	payment_method: PaymentMethod;
}
/** Provider codes registered in the running server, including custom providers. */
export interface ProviderRegistry {
	providers: string[];
}
/** Describes a payment route. */
export interface PaymentRoute {
	id: string;
	service_type: ServiceType;
	payment_method: PaymentMethod;
	provider_account_id: string;
	provider_name: string;
	priority: number;
	active: boolean;
	created_at: string;
	updated_at: string;
}
/** Describes the latest provider health check. */
export interface ProviderHealthSnapshot {
	provider_account_id: string;
	provider_name: string;
	status: string;
	circuit_state: string;
	last_checked_at?: string;
	last_success_at?: string;
	last_failure_at?: string;
	consecutive_failures: number;
	latency_ms: number;
	collections_available: boolean;
	disbursements_available: boolean;
	balance_query_available: boolean;
	last_error_code?: string;
	last_error_message?: string;
	created_at?: string;
	updated_at?: string;
}
/** Describes an administrator audit entry. */
export interface AuditLog {
	id: string;
	actor_id: string;
	actor_type: string;
	action: string;
	entity_type: string;
	entity_id: string;
	metadata_json: string;
	ip_address: string;
	user_agent: string;
	created_at: string;
	updated_at: string;
}
/** Describes an initialized provider runtime. */
export interface RuntimeProvider {
	provider_account_id: string;
	provider_name: string;
	provider_code: string;
	config_version: number;
	active: boolean;
	initialized: boolean;
	capabilities: ProviderCapability[];
	country: string;
	currency: string;
	health?: ProviderHealthSnapshot;
}
/** Describes available and ledger provider balances. */
export interface ProviderBalance {
	currency: string;
	available: number;
	ledger: number;
}
/** Describes one provider balance query result. */
export interface ProviderBalanceResult {
	provider_account_id: string;
	provider_code?: string;
	country: string;
	status: string;
	balance?: ProviderBalance;
	error?: string;
}
/** Describes server runtime metadata. */
export interface SystemInfo {
	app_name: string;
	app_env: string;
	db_type: string;
	addr: string;
	workers_enabled: boolean;
	worker_names: string[];
	go_version: string;
	server_time: string;
}
/** Describes server and database health. */
export interface SystemHealth {
	ok: boolean;
	database: string;
	runtime_provider_count: number;
	active_provider_account_count: number;
	workers_configured: string[];
	server_time: string;
}
/** Describes one background worker. */
export interface WorkerState {
	name: string;
	configured: boolean;
	state: string;
}

/** Transaction counts for one bucket, split by service. */
export interface ServiceCounts {
	collection: number;
	disbursement: number;
}
/** Describes one transaction analytics time bucket. */
export interface AnalyticsBucket {
	period: string;
	total: number;
	by_service: ServiceCounts;
	succeeded: number;
	failed: number;
}
/** Describes payment volume for one currency. */
export interface CurrencyVolume {
	currency: string;
	count: number;
	amount: number;
}
/** Describes bucketed transaction counts and currency volumes. */
export interface TransactionAnalytics {
	from: string;
	to: string;
	interval: "day" | "hour";
	buckets: AnalyticsBucket[];
	total: number;
	by_service: ServiceCounts;
	volume: CurrencyVolume[];
}
/** Filters a transaction analytics query. */
export interface AnalyticsQuery {
	from?: string;
	to?: string;
	interval?: "day" | "hour";
	appId?: string;
	providerAccountId?: string;
}
