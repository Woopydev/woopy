const assert = require("node:assert/strict");
const { test, describe, beforeEach, afterEach } = require("node:test");

const Woopy = require("../index");

// The Woopy inbound endpoint does `params.require(:notification)` - a flat body is
// rejected with 400 ParameterMissing. `alert()` is the only thing this client does,
// so the shape it puts on the wire IS the contract. Asserting on the captured
// request body (not on a mock of our own making) is what makes this test able to
// disagree with the code.
let captured;

const fakeFetch = (status = 201, payload = { message: "Notification created successfully" }) =>
    async (url, options) => {
        captured = { url, options, body: JSON.parse(options.body) };
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => payload,
        };
    };

describe("Woopy#alert", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        captured = undefined;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    test("wraps the payload in `notification`, as the API requires", async () => {
        global.fetch = fakeFetch();
        const woopy = new Woopy({ token: "app_token" });

        await woopy.alert({
            title: "Payment worker crashed",
            body: "Connection refused",
            actions: ["restart_worker"],
        });

        assert.deepEqual(captured.body, {
            notification: {
                title: "Payment worker crashed",
                body: "Connection refused",
                actions: ["restart_worker"],
            },
        });
    });

    test("does not double-wrap when the caller already passed `notification`", async () => {
        global.fetch = fakeFetch();
        const woopy = new Woopy({ token: "app_token" });

        await woopy.alert({ notification: { title: "Already wrapped" } });

        assert.deepEqual(captured.body, {
            notification: { title: "Already wrapped" },
        });
    });

    test("posts to /notifications with the app token", async () => {
        global.fetch = fakeFetch();
        const woopy = new Woopy({ token: "app_token" });

        await woopy.alert({ title: "Hi" });

        assert.equal(captured.url, "https://api.woopy.dev/api/v1/notifications");
        assert.equal(captured.options.method, "POST");
        assert.equal(captured.options.headers["X-App-Token"], "app_token");
    });

    test("throws with the API message when the request fails", async () => {
        global.fetch = fakeFetch(400, { error: "param is missing", message: "param is missing: notification" });
        const woopy = new Woopy({ token: "app_token" });

        await assert.rejects(
            () => woopy.alert({ title: "Hi" }),
            /param is missing: notification/,
        );
    });
});
