import type { APIEnvelope } from "./types.js";

/** Represents a non-successful Momobase API response. */
export class MomobaseAPIError extends Error {
	/** HTTP response status. */
	readonly status: number;
	/** Stable Momobase error code. */
	readonly code: string;
	/** Parsed response body when available. */
	readonly body: unknown;

	/** Creates an API error. */
	constructor(status: number, code: string, message: string, body: unknown) {
		super(message);
		this.name = "MomobaseAPIError";
		this.status = status;
		this.code = code;
		this.body = body;
	}

	/** Parses an API error from a Fetch response. */
	static async fromResponse(response: Response): Promise<MomobaseAPIError> {
		let body: unknown;
		try {
			body = await response.json();
		} catch {
			body = await response.text().catch(() => "");
		}
		const maybe = body as Partial<APIEnvelope>;
		const code = maybe.error?.code ?? `HTTP_${response.status}`;
		const message =
			maybe.error?.message ?? maybe.message ?? response.statusText;
		return new MomobaseAPIError(response.status, code, message, body);
	}
}
