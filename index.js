class Woopy {
    constructor(config = {}) {
        // `apiKey` is accepted as an alias for `token` for backwards
        // compatibility with older snippets and integrations.
        const token = config.token || config.apiKey;
        if (!token) {
            throw new Error("Token is required to initialize Woopy!");
        }
        this.token = token;
        this.baseUrl = config.baseUrl || "https://api.woopy.dev/api/v1";
    }

    async alert(data = {}) {
        const response = await fetch(`${this.baseUrl}/notifications`, {
            method: "POST",
            headers: {
                "X-App-Token": `${this.token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            let message = `HTTP ${response.status}`;
            try {
                const error = await response.json();
                message = error.message || error.error || message;
            } catch (_) {
                // non-JSON error body - keep the HTTP status message
            }
            throw new Error(`Woopy Error: ${message}`);
        }

        return await response.json();
    }
}

module.exports = Woopy;
// Support both `import Woopy from '@woopysdk/node'` and
// `import { Woopy } from '@woopysdk/node'` in ESM.
module.exports.Woopy = Woopy;
module.exports.default = Woopy;
