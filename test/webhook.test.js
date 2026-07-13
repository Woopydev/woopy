const assert = require("node:assert/strict");
const { test, describe } = require("node:test");

// Someone else's implementation of the standard, used to PRODUCE signatures. Our
// own signer verifying our own signature would only prove the code agrees with
// itself; what matters is that it agrees with the Woopy backend and with every
// other Standard Webhooks library a user might reach for. Test-only dependency:
// the published SDK has none.
const { Webhook } = require("standardwebhooks");

const { verifyWebhook, WoopyWebhookVerificationError } = require("../webhook");

// A real request captured from the Woopy backend (WebhookSigner, slice 009 stage 5).
// If the backend ever changes how it signs, this fixture fails and the SDK stops
// silently accepting nothing.
const BACKEND = {
    secret: "whsec_d29vcHktZG9jLWZpeHR1cmUta2V5LTMyLWJ5dGVzISE=",
    body: '{"delivery_id":"f9ea5065-d359-4753-acf0-d48df8623e8e","action_key":"restart_workers","title":"Restart Workers","application_id":"5e27bbb3-410c-474a-bb75-9d2a65352c5f","notification_id":"1433e450-adcb-46f4-8747-c5a44d2efab5","fired_at":"2026-07-13T09:15:00Z"}',
    headers: {
        "webhook-id": "f9ea5065-d359-4753-acf0-d48df8623e8e",
        "webhook-timestamp": "1783934100",
        "webhook-signature": "v1,sjmXt8AGgjaZrVXWAQryXQZCWfruLtbam0SS7nbDkuo=",
    },
    // The moment the fixture was signed, so the tolerance check sees a fresh request.
    now: 1783934100 * 1000,
};

const SECRET = "whsec_" + Buffer.from("a".repeat(32)).toString("base64");
const ID = "6a5c1a1e-2b64-4c3f-8c2d-9a1f0e5b7d21";
const NOW = 1783934100 * 1000;

// The npm implementation takes a Date and derives the unix timestamp itself,
// where the Ruby one takes the string. Same signed string either way.
function sign(body, { secret = SECRET, id = ID, now = NOW } = {}) {
    const signature = new Webhook(secret).sign(id, new Date(now), body);

    return {
        "webhook-id": id,
        "webhook-timestamp": String(Math.floor(now / 1000)),
        "webhook-signature": signature,
    };
}

const BODY = JSON.stringify({ delivery_id: ID, action_key: "restart_workers" });

describe("verifyWebhook", () => {
    test("accepts a real request produced by the Woopy backend", () => {
        const payload = verifyWebhook(BACKEND.body, BACKEND.headers, BACKEND.secret, { now: BACKEND.now });

        assert.equal(payload.action_key, "restart_workers");
        assert.equal(payload.delivery_id, "f9ea5065-d359-4753-acf0-d48df8623e8e");
        assert.equal(payload.application_id, "5e27bbb3-410c-474a-bb75-9d2a65352c5f");
        assert.equal(payload.notification_id, "1433e450-adcb-46f4-8747-c5a44d2efab5");
    });

    // Every id in a Woopy payload is a UUID string as of 2.0.0 - it used to be a
    // number. Asserting the value alone would still pass if the backend ever went
    // back to numbers and the fixture followed it; asserting the type is what
    // pins down the contract this major version breaks.
    test("carries every id as a string, not a number", () => {
        const payload = verifyWebhook(BACKEND.body, BACKEND.headers, BACKEND.secret, { now: BACKEND.now });

        assert.equal(typeof payload.delivery_id, "string");
        assert.equal(typeof payload.application_id, "string");
        assert.equal(typeof payload.notification_id, "string");
    });

    test("accepts a signature produced by another Standard Webhooks implementation", () => {
        const payload = verifyWebhook(BODY, sign(BODY), SECRET, { now: NOW });

        assert.equal(payload.action_key, "restart_workers");
    });

    test("accepts a raw Buffer body", () => {
        const payload = verifyWebhook(Buffer.from(BODY, "utf8"), sign(BODY), SECRET, { now: NOW });

        assert.equal(payload.action_key, "restart_workers");
    });

    test("accepts headers in any casing", () => {
        const headers = sign(BODY);
        const shouty = {
            "Webhook-Id": headers["webhook-id"],
            "Webhook-Timestamp": headers["webhook-timestamp"],
            "Webhook-Signature": headers["webhook-signature"],
        };

        assert.doesNotThrow(() => verifyWebhook(BODY, shouty, SECRET, { now: NOW }));
    });

    test("accepts a secret without the whsec_ prefix", () => {
        const bare = SECRET.slice("whsec_".length);

        assert.doesNotThrow(() => verifyWebhook(BODY, sign(BODY), bare, { now: NOW }));
    });

    // --- rejection ---

    test("rejects a tampered body", () => {
        const headers = sign(BODY);
        const tampered = BODY.replace("restart_workers", "delete_database");

        assert.throws(
            () => verifyWebhook(tampered, headers, SECRET, { now: NOW }),
            (error) => error instanceof WoopyWebhookVerificationError && error.code === "no_matching_signature",
        );
    });

    // The id is inside the signed string precisely so a captured signature cannot
    // be re-attached to a different delivery.
    test("rejects a signature lifted onto a different delivery id", () => {
        const headers = { ...sign(BODY), "webhook-id": "11111111-2222-3333-4444-555555555555" };

        assert.throws(
            () => verifyWebhook(BODY, headers, SECRET, { now: NOW }),
            (error) => error.code === "no_matching_signature",
        );
    });

    test("rejects a signature made with a different secret", () => {
        const otherSecret = "whsec_" + Buffer.from("b".repeat(32)).toString("base64");

        assert.throws(
            () => verifyWebhook(BODY, sign(BODY, { secret: otherSecret }), SECRET, { now: NOW }),
            (error) => error.code === "no_matching_signature",
        );
    });

    test("rejects a replay from six minutes ago", () => {
        const headers = sign(BODY, { now: NOW - 6 * 60 * 1000 });

        assert.throws(
            () => verifyWebhook(BODY, headers, SECRET, { now: NOW }),
            (error) => error.code === "timestamp_out_of_tolerance",
        );
    });

    // A far-future timestamp would otherwise hand an attacker an arbitrarily long
    // replay window on a request they captured once.
    test("rejects a timestamp far in the future", () => {
        const headers = sign(BODY, { now: NOW + 6 * 60 * 1000 });

        assert.throws(
            () => verifyWebhook(BODY, headers, SECRET, { now: NOW }),
            (error) => error.code === "timestamp_out_of_tolerance",
        );
    });

    test("accepts a request four minutes old", () => {
        const headers = sign(BODY, { now: NOW - 4 * 60 * 1000 });

        assert.doesNotThrow(() => verifyWebhook(BODY, headers, SECRET, { now: NOW }));
    });

    test("rejects missing headers", () => {
        assert.throws(
            () => verifyWebhook(BODY, {}, SECRET, { now: NOW }),
            (error) => error.code === "missing_headers",
        );
    });

    test("rejects an unsigned version prefix", () => {
        const headers = { ...sign(BODY), "webhook-signature": "v2,ZGVmaW5pdGVseSBub3QgYSBzaWduYXR1cmU=" };

        assert.throws(
            () => verifyWebhook(BODY, headers, SECRET, { now: NOW }),
            (error) => error.code === "no_matching_signature",
        );
    });

    test("rejects two conflicting signature headers", () => {
        const headers = { ...sign(BODY), "webhook-signature": ["v1,aaa", "v1,bbb"] };

        assert.throws(
            () => verifyWebhook(BODY, headers, SECRET, { now: NOW }),
            (error) => error.code === "ambiguous_headers",
        );
    });

    // The most common integration mistake. A parsed body cannot be re-serialized
    // byte for byte, so it would reject every genuine webhook - say so loudly.
    test("rejects a parsed body with an actionable error", () => {
        assert.throws(
            () => verifyWebhook(JSON.parse(BODY), sign(BODY), SECRET, { now: NOW }),
            (error) => error instanceof TypeError && /raw request body/.test(error.message),
        );
    });

    // --- rotation window: the backend signs with both secrets ---

    test("accepts either secret while a rotation is in flight", () => {
        const previousSecret = SECRET;
        const newSecret = "whsec_" + Buffer.from("c".repeat(32)).toString("base64");
        const timestamp = String(Math.floor(NOW / 1000));

        const headers = {
            "webhook-id": ID,
            "webhook-timestamp": timestamp,
            "webhook-signature": [
                new Webhook(newSecret).sign(ID, new Date(NOW), BODY),
                new Webhook(previousSecret).sign(ID, new Date(NOW), BODY),
            ].join(" "),
        };

        assert.doesNotThrow(() => verifyWebhook(BODY, headers, newSecret, { now: NOW }));
        assert.doesNotThrow(() => verifyWebhook(BODY, headers, previousSecret, { now: NOW }));
    });
});
