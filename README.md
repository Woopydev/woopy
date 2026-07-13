# Woopy Node.js SDK

Official Node.js library for the **Woopy API**. Send alerts and notifications to your system with ease and full TypeScript support.

Site: https://woopy.dev/

## Installation

Install the package using your favorite package manager:

```bash
npm install @woopysdk/node
```

Or:

```bash
yarn add @woopysdk/node
```

---

## Quick Start

Initialize the Woopy client and trigger your first alert.

```javascript
import Woopy from '@woopysdk/node'

const woopy = new Woopy({
  token: process.env.WOOPY_TOKEN,
})

// In your job / handler
async function processPayment(orderId) {
  try {
    await runPayment(orderId)
  } catch (error) {
    await woopy.alert({
      title: 'Payment worker crashed',
      body: error.message,
      actions: ['restart_worker', 'flush_cache'],
    })
    throw error
  }
}
```

Using CommonJS? The same client is available via `require`:

```javascript
const Woopy = require('@woopysdk/node')
```

---

## Verifying Webhooks

When you tap a Remote Action, Woopy sends a signed `POST` request to your webhook URL. Anyone who learns that URL can send a forged request to it, so verify the signature before you act on it.

Woopy signs every request following the [Standard Webhooks](https://www.standardwebhooks.com/) specification. `verifyWebhook` checks the signature and the timestamp, and returns the parsed payload:

```javascript
import express from 'express'
import { verifyWebhook, WoopyWebhookVerificationError } from '@woopysdk/node'

const app = express()

// The signature covers the exact bytes Woopy sent, so hand verifyWebhook the raw
// body. A parsed-and-re-serialized body does not round-trip byte for byte.
app.post(
  '/webhooks/woopy',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    let payload
    try {
      payload = verifyWebhook(req.body, req.headers, process.env.WOOPY_WEBHOOK_SECRET)
    } catch (error) {
      if (error instanceof WoopyWebhookVerificationError) {
        return res.status(401).json({ error: 'Invalid signature' })
      }
      throw error
    }

    // delivery_id is stable across retries - use it to make the action idempotent.
    console.log(`Running "${payload.action_key}" (delivery ${payload.delivery_id})`)

    res.json({ status: 'success' })
  },
)
```

Already using `express.json()` elsewhere? Keep the raw bytes alongside the parsed body:

```javascript
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf
    },
  }),
)
```

`verifyWebhook` **throws** rather than returning `false`, so a forgotten `if` cannot let a forged request through. It rejects a request whose body was tampered with, whose signature was lifted from another delivery, or whose timestamp is more than 5 minutes away from now (replay protection).

### Rotating the secret

Rotate the webhook secret from the dashboard (**Rotate Webhook Secret**). For the next 24 hours Woopy signs every request with both the new and the previous secret, so your endpoint keeps working while you deploy the new value. After the window, only the new secret signs.

---

## API Reference

### `new Woopy(config)`
Creates a new Woopy client instance.

**`WoopyConfig` Interface:**

| Property | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `token` | `string` | **Yes** | Your secret API inbound token from the Woopy dashboard. |
| `apiKey` | `string` | No | Alias for `token`, kept for backwards compatibility. |
| `baseUrl` | `string` | No | Custom API endpoint (e.g., for staging or testing). |

---

### `woopy.alert(data)`
Triggers an alert. Returns a `Promise<WoopyResponse>`.

**`WoopyAlertData` Object:**

| Property | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `title` | `string` | **Yes** | The headline/title of the alert. |
| `body` | `string` | No | The main content/message of the alert. |
| `actions` | `string[]` | No | List of action keys for notification buttons (configured in web platform). |

**`WoopyResponse` Object:**
* `message`: `string` - Success message from the API.
* `error`: `string` (optional) - Error details if the request failed.

---

### `verifyWebhook(rawBody, headers, secret, options?)`
Verifies an incoming webhook and returns the parsed `WoopyWebhookPayload`. Throws `WoopyWebhookVerificationError` when the request is forged, tampered with, or replayed.

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `rawBody` | `string \| Buffer` | **Yes** | The raw, unparsed request body. Not the parsed object. |
| `headers` | `object` | **Yes** | The incoming request headers. Any casing. |
| `secret` | `string` | **Yes** | The application's webhook secret (`whsec_...`) from the dashboard. |
| `options.toleranceSeconds` | `number` | No | How far the timestamp may drift from now. Defaults to `300`. |

**`WoopyWebhookPayload` Object:**

| Property | Type | Description |
| :--- | :--- | :--- |
| `delivery_id` | `string` | Unique id of this delivery. Use it as an idempotency key. |
| `action_key` | `string` | The unique key of the triggered action. |
| `title` | `string` | The action's title (its button label). |
| `application_id` | `string` | UUID of the application the action belongs to. |
| `notification_id` | `string \| null` | UUID of the alert the action was fired from, when applicable. |
| `fired_at` | `string` | ISO 8601 timestamp of when the action was fired. |

Every id in the payload is a UUID string. In `1.x`, `application_id` and `notification_id` were numbers - see the [changelog](CHANGELOG.md) if you are upgrading.

A delivered payload looks like this:

```json
{
  "delivery_id": "fde32757-0cde-4fc6-8dcc-57f69c9edc8c",
  "action_key": "restart_workers",
  "title": "Restart Workers",
  "application_id": "666d605a-dd94-40b2-9b20-5c399299feae",
  "notification_id": "381ddb5c-53a2-45df-886c-00c0da714b39",
  "fired_at": "2026-07-13T09:20:00Z"
}
```

---

## TypeScript Support

This SDK is written with TypeScript in mind and includes built-in type definitions.

```typescript
import Woopy, { WoopyAlertData } from '@woopysdk/node';

const woopy = new Woopy({ token: process.env.WOOPY_TOKEN });

const alertData: WoopyAlertData = {
  title: "Critical Error",
  body: "Database connection lost.",
  actions: ["restart_worker", "flush_cache"]
};

await woopy.alert(alertData);
```

## License

[ISC](LICENSE)
