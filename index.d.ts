/**
 * Configuration options for the Woopy client.
 * Either `token` or `apiKey` must be provided.
 */
export interface WoopyConfig {
    /** Your secret API token from the Woopy dashboard */
    token?: string;
    /** Alias for `token`, kept for backwards compatibility */
    apiKey?: string;
    /** Optional custom API base URL (e.g., for staging or testing) */
    baseUrl?: string;
}

/**
 * Standard response structure from the Woopy API.
 */
export interface WoopyResponse {
    message: string;
    error?: string;
}

export interface WoopyAlertData {
    /** The title of the alert */
    title: string;
    /** The main content of the alert */
    body?: string;
    /** List of action keys that can be taken for notification */
    actions?: string[]
}

/**
 * The payload Woopy POSTs to your webhook endpoint when a Remote Action fires.
 */
export interface WoopyWebhookPayload {
    /** Unique id of this delivery. Also sent as the `webhook-id` header. Use it as an idempotency key. */
    delivery_id: string;
    /** The unique key of the triggered action */
    action_key: string;
    /** The action's title (its button label) */
    title: string;
    /** UUID of the application the action belongs to */
    application_id: string;
    /** UUID of the notification the action was fired from, or null when fired outside an alert */
    notification_id: string | null;
    /** ISO 8601 timestamp of when the action was fired */
    fired_at: string;
}

export type WoopyWebhookErrorCode =
    | "missing_headers"
    | "ambiguous_headers"
    | "invalid_timestamp"
    | "timestamp_out_of_tolerance"
    | "no_matching_signature";

/**
 * Thrown when an incoming request is not a genuine, fresh Woopy webhook.
 * Every instance means: reject the request.
 */
export declare class WoopyWebhookVerificationError extends Error {
    name: "WoopyWebhookVerificationError";
    code: WoopyWebhookErrorCode;
}

export interface VerifyWebhookOptions {
    /** How far the webhook timestamp may drift from now, in seconds. Defaults to 300. */
    toleranceSeconds?: number;
    /** Current time in milliseconds since the epoch. Injectable for tests. */
    now?: number;
}

/**
 * Verifies that an incoming request is a genuine Woopy webhook (Standard Webhooks).
 *
 * @param rawBody The raw, unparsed request body - NOT the parsed object.
 * @param headers The incoming request headers.
 * @param secret Your application's webhook secret (`whsec_...`) from the dashboard.
 * @throws {WoopyWebhookVerificationError} When the request is forged, tampered with, or replayed.
 */
export declare function verifyWebhook(
    rawBody: string | Buffer | Uint8Array,
    headers: Record<string, string | string[] | undefined> | Headers,
    secret: string,
    options?: VerifyWebhookOptions,
): WoopyWebhookPayload;

/**
 * The main Woopy client class for interacting with the API.
 */
declare class Woopy {
    /**
     * Initializes a new instance of the Woopy client.
     * @param config The configuration object including your API token.
     */
    constructor(config: WoopyConfig);

    /** The API token used for authentication */
    token: string;

    /** The base URL of the API */
    baseUrl: string;

    /**
     * Triggers an alert in the Woopy system.
     * @param data The alert payload (e.g., title, body, actions).
     * @returns A Promise that resolves to the API response.
     */
    alert(data: WoopyAlertData): Promise<WoopyResponse>;
}

export { Woopy };
export default Woopy;
