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
