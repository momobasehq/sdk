import { endpoint, SessionClient } from "./session.js";
import type {
    AvailablePaymentMethods,
    CreateCollectionRequest,
    CreateDisbursementRequest,
    CreatePaymentResponse,
    RequestOptions,
    ServiceType,
    Transaction
} from "./types.js";

/** Configures application authentication and API access. */
export interface MomobaseClientOptions {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    tokenSkewSeconds?: number;
}

function validatePayment(
    _kind: "collection" | "disbursement",
    p: CreateCollectionRequest | CreateDisbursementRequest
) {
    // The account stays opaque here: what a valid one looks like is the provider's to
    // decide, so the client only checks what the API requires of every payment.
    if (!p.payment_method) throw new Error("payment_method is required");
    if (!p.account) throw new Error("account is required");
    if (!p.country || p.country.length !== 2)
        throw new Error("country must be a 2-letter ISO code");
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
                client_secret: this.options.clientSecret
            },
            signal
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
                    refresh_token: this.token.refreshToken
                },
                signal
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
            o: RequestOptions = {}
        ) => {
            const search = new URLSearchParams();
            if (q.serviceType) search.set("service_type", q.serviceType);
            if (q.country) search.set("country", q.country);
            return this.get<AvailablePaymentMethods>(
                `/api/v1/payment-methods${search.size ? `?${search}` : ""}`,
                o
            );
        }
    };
    /** Creates collection payments. */
    readonly collections = {
        /** Creates a collection. */
        create: (p: CreateCollectionRequest, o: RequestOptions = {}) => {
            validatePayment("collection", p);
            return this.post<CreatePaymentResponse>(
                "/api/v1/collections",
                p,
                o
            );
        }
    };
    /** Creates disbursement payments. */
    readonly disbursements = {
        /** Creates a disbursement. */
        create: (p: CreateDisbursementRequest, o: RequestOptions = {}) => {
            validatePayment("disbursement", p);
            return this.post<CreatePaymentResponse>(
                "/api/v1/disbursements",
                p,
                o
            );
        }
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
                o
            )
    };
}
