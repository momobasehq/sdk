import { MomobaseAPIError } from "./errors.js";
import type {
    APIEnvelope,
    ListOptions,
    OAuthTokenResponse,
    RequestOptions
} from "./types.js";

/** The current session tokens and the epoch milliseconds at which they expire. */
export interface TokenSnapshot {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
}
type Method = "GET" | "POST" | "PATCH" | "DELETE";
type CachedToken = TokenSnapshot;

/** Renders list pagination as a query string. */
const query = (o?: ListOptions) => {
    const q = new URLSearchParams();
    if (o?.page) q.set("page", String(o.page));
    if (o?.perPage) q.set("per_page", String(o.perPage));
    return q.size ? `?${q}` : "";
};
/** Appends an escaped resource id to a collection path. */
export const endpoint = (path: string, id: string) =>
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
                body
            );
        return body.data as T;
    }
    return body as T;
}
function cached(t: OAuthTokenResponse, skew: number): CachedToken {
    return {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: Date.now() + Math.max(t.expires_in - skew, 1) * 1000
    };
}

/** Holds an OAuth session and issues authenticated requests against it. */
export abstract class SessionClient {
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
        signal?: AbortSignal
    ): Promise<OAuthTokenResponse>;
    protected abstract refresh(
        signal?: AbortSignal
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
        accessToken: string
    ) {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`
        };
        if (method !== "GET") headers["Content-Type"] = "application/json";
        if (options.idempotencyKey)
            headers["Idempotency-Key"] = options.idempotencyKey;
        return fetch(this.baseUrl + path, {
            method,
            headers,
            body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
            signal: options.signal
        });
    }
    protected async request<T>(
        method: Method,
        path: string,
        payload?: unknown,
        options: RequestOptions = {}
    ) {
        const accessToken = await this.bearer(options.signal);
        let response = await this.send(
            method,
            path,
            payload,
            options,
            accessToken
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
                await this.bearer(options.signal)
            );
        }
        return unwrap<T>(response);
    }
    protected get<T>(path: string, options?: RequestOptions) {
        return this.request<T>("GET", path, undefined, options);
    }
    /** Issues a paginated GET, forwarding pagination and the abort signal. */
    protected list<T>(path: string, o?: ListOptions) {
        return this.get<T>(path + query(o), o);
    }
    protected post<T>(
        path: string,
        payload?: unknown,
        options?: RequestOptions
    ) {
        return this.request<T>("POST", path, payload, options);
    }
    protected patch<T>(
        path: string,
        payload?: unknown,
        options?: RequestOptions
    ) {
        return this.request<T>("PATCH", path, payload, options);
    }
    protected delete<T>(path: string, options?: RequestOptions) {
        return this.request<T>("DELETE", path, undefined, options);
    }
    protected async form(
        path: string,
        values: Record<string, string>,
        signal?: AbortSignal
    ) {
        const r = await fetch(this.baseUrl + path, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(values),
            signal
        });
        if (!r.ok) throw await MomobaseAPIError.fromResponse(r);
        return this.setToken((await r.json()) as OAuthTokenResponse);
    }
}
