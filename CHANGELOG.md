# Changelog

All notable changes to `@woopysdk/node` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-07-09

### Added

- `verifyWebhook(payload, headers, secret, options?)` - verifies the
  [Standard Webhooks](https://www.standardwebhooks.com/) signature Woopy puts on
  every outgoing Remote Action request, and returns the parsed payload. Exported
  as a standalone function rather than a client method: the route handler
  receiving webhooks has no reason to hold an API token, and the webhook secret
  is a different credential than the token.
- `WoopyWebhookVerificationError` - thrown when the signature, the timestamp, or
  a required header does not check out. Every failure is this one error type, so
  a caller cannot accidentally branch on *why* verification failed and leak that
  distinction back to the sender.

### Notes on `verifyWebhook`

- The payload must be the **raw request body** (a `Buffer` or a `string`), not a
  parsed object. Passing an object throws `TypeError`, because re-serializing it
  would not reproduce the bytes that were signed. Parse the JSON only after
  verification returns.
- Signatures are compared with `crypto.timingSafeEqual`.
- Timestamps outside a 5-minute window (either direction) are rejected. Override
  with `options.toleranceSeconds`.
- A `webhook-signature` header may carry several space-separated signatures.
  Woopy sends two while a webhook secret is being rotated, so any one of them
  matching is enough - your endpoint keeps working across a rotation without a
  restart.

## [1.1.0] - 2026-07-02

### Added

- Named and default ESM exports, so both `import Woopy from '@woopysdk/node'`
  and `import { Woopy } from '@woopysdk/node'` work. Only the CommonJS default
  export existed before, which broke the quickstart snippet under ESM.
- `config.baseUrl` is now honored, instead of being silently ignored in favor of
  the hardcoded production URL.
- `config.apiKey` is accepted as an alias for `config.token`, for older snippets
  and integrations.

### Changed

- Failed requests whose body is not JSON no longer throw an opaque parse error.
  The thrown message falls back to `HTTP <status>`.

## [1.0.1] - 2026-04-21

### Changed

- Base API URL moved from `api.woopy.com` to `api.woopy.dev`. Every `1.0.0`
  install talks to a host Woopy does not own; upgrading is required for the SDK
  to reach the API at all.
- The "token is required" error message is now in English.

## [1.0.0] - 2026-03-17

### Added

- Initial release as `@woopysdk/node`: the `Woopy` client and `alert()`, which
  sends a notification to your paired devices.
