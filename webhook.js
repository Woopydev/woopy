const crypto = require("crypto");

const SECRET_PREFIX = "whsec_";
const SIGNATURE_VERSION = "v1";
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Thrown when an incoming request is not a genuine, fresh Woopy webhook.
 *
 * Treat every instance as "reject the request". The `code` tells you why, which
 * is useful in logs, but it must never change what you do: a request that fails
 * verification for any reason did not come from Woopy.
 */
class WoopyWebhookVerificationError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "WoopyWebhookVerificationError";
        this.code = code;
    }
}

// Header names are case-insensitive per RFC 9110, and frameworks disagree on the
// casing they hand you: Node and Express lowercase, some proxies and serverless
// runtimes do not.
function readHeader(headers, name) {
    if (headers === null || typeof headers !== "object") {
        throw new TypeError("verifyWebhook: `headers` must be the request headers object");
    }

    // Headers objects (undici, Cloudflare Workers) are not plain objects.
    if (typeof headers.get === "function") {
        return headers.get(name);
    }

    const match = Object.keys(headers).find((key) => key.toLowerCase() === name);
    if (match === undefined) return undefined;

    const value = headers[match];

    // Node exposes repeated headers as an array. Two different signature headers
    // mean two different senders disagree about this request - refuse to guess.
    if (Array.isArray(value)) {
        if (value.length !== 1) {
            throw new WoopyWebhookVerificationError(
                `Expected exactly one \`${name}\` header, got ${value.length}`,
                "ambiguous_headers"
            );
        }
        return value[0];
    }

    return value;
}

function toBodyBuffer(rawBody) {
    if (typeof rawBody === "string") return Buffer.from(rawBody, "utf8");
    if (Buffer.isBuffer(rawBody)) return rawBody;
    if (rawBody instanceof Uint8Array) return Buffer.from(rawBody);

    // The single most common integration mistake: passing the parsed body. The
    // signature covers the exact bytes Woopy sent, and `JSON.parse` followed by
    // `JSON.stringify` does not round-trip them (key order, whitespace, unicode
    // escapes). Fail loudly rather than reject every genuine webhook.
    throw new TypeError(
        "verifyWebhook: `rawBody` must be the raw request body as a string or Buffer, " +
            "not the parsed object. In Express, use express.raw({ type: 'application/json' }) " +
            "or express.json({ verify: (req, _res, buf) => { req.rawBody = buf } })."
    );
}

function decodeSecret(secret) {
    if (typeof secret !== "string" || secret.length === 0) {
        throw new TypeError("verifyWebhook: `secret` must be your application's webhook secret (whsec_...)");
    }

    const key = Buffer.from(
        secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
        "base64"
    );

    if (key.length === 0) {
        throw new TypeError("verifyWebhook: `secret` is not a valid Woopy webhook secret");
    }

    return key;
}

/**
 * Verifies that an incoming request is a genuine Woopy webhook, following the
 * Standard Webhooks specification (https://www.standardwebhooks.com/).
 *
 * Returns the parsed JSON payload. Throws WoopyWebhookVerificationError when the
 * request is forged, tampered with, or replayed - never returns false, so a
 * forgotten `if` cannot let a forged request through.
 *
 * @param {string|Buffer} rawBody The raw, unparsed request body.
 * @param {object} headers The incoming request headers.
 * @param {string} secret The application's webhook secret from the dashboard.
 * @param {{toleranceSeconds?: number, now?: number}} [options]
 * @returns {object} The parsed webhook payload.
 */
function verifyWebhook(rawBody, headers, secret, options = {}) {
    const toleranceSeconds = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
    const now = options.now ?? Date.now();

    const body = toBodyBuffer(rawBody);
    const key = decodeSecret(secret);

    const id = readHeader(headers, "webhook-id");
    const timestamp = readHeader(headers, "webhook-timestamp");
    const signature = readHeader(headers, "webhook-signature");

    if (!id || !timestamp || !signature) {
        throw new WoopyWebhookVerificationError(
            "Missing webhook-id, webhook-timestamp or webhook-signature header",
            "missing_headers"
        );
    }

    const sentAtSeconds = Number(timestamp);
    if (!Number.isInteger(sentAtSeconds)) {
        throw new WoopyWebhookVerificationError("Invalid webhook-timestamp header", "invalid_timestamp");
    }

    // Rejecting old requests is what makes a captured webhook useless to a
    // replay attacker. The timestamp is inside the signed string, so it cannot be
    // refreshed without the secret. Checked in both directions: a far-future
    // timestamp would otherwise buy an attacker an arbitrarily long replay window.
    const driftSeconds = Math.abs(Math.floor(now / 1000) - sentAtSeconds);
    if (driftSeconds > toleranceSeconds) {
        throw new WoopyWebhookVerificationError(
            `Webhook timestamp is outside the ${toleranceSeconds}s tolerance window`,
            "timestamp_out_of_tolerance"
        );
    }

    // Signed string is "id.timestamp.body": the id binds the signature to this one
    // delivery, so a valid signature cannot be lifted onto a different request.
    const expected = crypto
        .createHmac("sha256", key)
        .update(`${id}.${timestamp}.`)
        .update(body)
        .digest();

    // During a secret rotation Woopy signs with both the new and the previous
    // secret, space-separated. Either one verifying means the request is genuine,
    // which is what lets you switch secrets without dropping a single webhook.
    const candidates = String(signature).split(" ");

    for (const candidate of candidates) {
        const [version, value] = candidate.split(",", 2);
        if (version !== SIGNATURE_VERSION || !value) continue;

        const received = Buffer.from(value, "base64");
        // timingSafeEqual throws on a length mismatch, and a wrong length already
        // tells us this is not an HMAC-SHA256 digest.
        if (received.length !== expected.length) continue;

        if (crypto.timingSafeEqual(received, expected)) {
            return JSON.parse(body.toString("utf8"));
        }
    }

    throw new WoopyWebhookVerificationError("No matching webhook signature", "no_matching_signature");
}

module.exports = { verifyWebhook, WoopyWebhookVerificationError };
