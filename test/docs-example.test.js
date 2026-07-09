const assert = require("node:assert/strict");
const { test, describe } = require("node:test");

const { verifyWebhook, WoopyWebhookVerificationError } = require("../webhook");

// The handler body below is a verbatim copy of the example published in the SDK
// README and in https://woopy.dev/docs/security/. If a doc change breaks it, this
// test breaks - the promise "copy this, change nothing, it works" has to be
// enforced by something other than good intentions.
//
// Only the Express plumbing is replaced by a fake req/res, so the SDK keeps its
// zero dependencies. Everything between the try and the final res.json is the
// documented code.
function woopyWebhookHandler(req, res, secret, options) {
    let payload;
    try {
        payload = verifyWebhook(req.body, req.headers, secret, options);
    } catch (error) {
        if (error instanceof WoopyWebhookVerificationError) {
            return res.status(401).json({ error: "Invalid signature" });
        }
        throw error;
    }

    return res.json({ status: "success", ran: payload.action_key });
}

function fakeRes() {
    const sent = { statusCode: 200, body: undefined };
    const res = {
        status(code) {
            sent.statusCode = code;
            return res;
        },
        json(body) {
            sent.body = body;
            return sent;
        },
    };
    return { res, sent };
}

// A real request produced by the Woopy backend (WebhookSigner), captured from
// the running API. Not signed by this SDK - that would prove nothing.
const REQUEST = {
    secret: "whsec_d29vcHktZG9jLWZpeHR1cmUta2V5LTMyLWJ5dGVzISE=",
    // Express hands `express.raw()` a Buffer, which is exactly what arrives here.
    body: Buffer.from(
        '{"delivery_id":"3f1c9b2e-8a44-4d1f-9c0e-77b2d5a61e30","action_key":"restart_workers","title":"Restart Workers","application_id":42,"notification_id":128,"fired_at":"2026-07-09T10:32:00Z"}',
        "utf8",
    ),
    headers: {
        "content-type": "application/json",
        "webhook-id": "3f1c9b2e-8a44-4d1f-9c0e-77b2d5a61e30",
        "webhook-timestamp": "1783593120",
        "webhook-signature": "v1,1pMj85mpF7SqQY5GS1GBCfRY4MkYGIg/lxuyoQ31IFY=",
    },
};

const SIGNED_AT_MS = 1783593120 * 1000;

describe("the example published in the docs", () => {
    test("accepts a genuine request from the Woopy backend", () => {
        const { res, sent } = fakeRes();

        woopyWebhookHandler({ body: REQUEST.body, headers: REQUEST.headers }, res, REQUEST.secret, {
            now: SIGNED_AT_MS,
        });

        assert.equal(sent.statusCode, 200);
        assert.deepEqual(sent.body, { status: "success", ran: "restart_workers" });
    });

    // The same captured request, replayed six minutes later. Nothing about it is
    // forged - it is byte-for-byte what Woopy sent - and it must still be refused.
    test("rejects the same request replayed six minutes later", () => {
        const { res, sent } = fakeRes();

        woopyWebhookHandler({ body: REQUEST.body, headers: REQUEST.headers }, res, REQUEST.secret, {
            now: SIGNED_AT_MS + 6 * 60 * 1000,
        });

        assert.equal(sent.statusCode, 401);
        assert.deepEqual(sent.body, { error: "Invalid signature" });
    });

    test("rejects a forged request signed with the wrong secret", () => {
        const { res, sent } = fakeRes();
        const wrongSecret = "whsec_" + Buffer.from("z".repeat(32)).toString("base64");

        woopyWebhookHandler({ body: REQUEST.body, headers: REQUEST.headers }, res, wrongSecret, {
            now: SIGNED_AT_MS,
        });

        assert.equal(sent.statusCode, 401);
    });
});
