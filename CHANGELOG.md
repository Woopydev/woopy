# Changelog

All notable changes to `@woopysdk/node` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-13

Woopy moved every identifier in its data model from a numeric id to a UUID. The
ids in the webhook payload changed with it, so the published types had to change
too. This is the only reason for the major bump.

### Changed

- **BREAKING (TypeScript):** in `WoopyWebhookPayload`, `application_id` is now
  `string` (was `number`) and `notification_id` is now `string | null` (was
  `number | null`). Both carry a UUID. `delivery_id` was already a `string` and
  is unchanged.
- **BREAKING (any language):** code that compares an id to a number - say
  `payload.application_id === 42`, or a lookup in a table keyed by numeric id -
  stops matching, silently. The values are now UUID strings such as
  `"666d605a-dd94-40b2-9b20-5c399299feae"`. Nothing throws; the comparison just
  never comes out true. Grep for the id fields before upgrading.

### Not changed

- `verifyWebhook` itself. It computes an HMAC over the raw bytes and ends at
  `JSON.parse`, never touching a payload field, so signature verification,
  replay protection and secret rotation behave exactly as in `1.2.0`. A handler
  that only reads `action_key` and `delivery_id` can upgrade with no code change.
- `Woopy`, `alert()` and every other export.

### Who has to do something

- Consumers of the TypeScript types: `tsc` will point at the comparisons and
  assignments that no longer typecheck. That is the intended migration path.
- Everyone else: only if you compare, store or route on `application_id` or
  `notification_id`. If you do, treat them as opaque strings.

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
