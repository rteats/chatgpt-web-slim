# Live Reader — Chromium prototype

A standalone extension page for viewing the signed-in user's live ChatGPT history via **user-initiated** GET requests observed in a HAR. It does not load the official ChatGPT site's JavaScript or share/replay HAR authentication tokens. The internal endpoints are undocumented, unsupported and may stop working. Terms may restrict programmatic access. This is not affiliated with OpenAI.

## Installation

1. From this branch download the repository as a ZIP and extract it.
2. Open chrome://extensions (or your Chromium browser's extensions page), enable Developer mode.
3. Select **Load unpacked** and choose the **live/** folder, which contains manifest.json.
4. Sign in normally at https://chatgpt.com in that same browser profile.
5. Click the Web Slim extension toolbar button, then **Открыть лёгкий клиент**.
6. Click **Подключиться / обновить список** to make the first network request.
7. Open a chat, load older messages, load next page of chat titles, or manually inspect installed-plugin metadata.

You can test without sending messages. Browser host permissions can allow cookies with SameSite flags, but backend authentication might still reject the request. If you receive 401, 403 or a network error, do not copy cookies from your HAR or disable browser security features.

## Restrictions

- No send button; the observed sending protocol includes server-side Sentinel challenge verification which isn't integrated.
- No attachment uploading, actual plugin invocation, rich widgets, voice or search.
- Only one explicit GET request at a time; >=3 seconds between starts, max 20 per ten minutes; no retries, polling or background prefetch. No account data is persisted.
- Live reader markup uses textContent; tool/system/internal text is excluded.
- live/stream.mjs is a **passive** tested SSE decoder, not a live transport.
- live/send-model.mjs is a **non-networking schema prototype**, not a credentialed sender.

See docs/har-sending-2026-11-12.md for sanitized protocol findings. Do not upload private HARs or conversation exports to the public repository.

## Tests

    node --test live/*.mjs

For module tests use the explicit test filenames:

    node --test live/api-tests.mjs live/protocol-tests.mjs

For JS syntax checks:

    node --check live/app.mjs
    node --check live/api.mjs
    node --check live/model.mjs
    node --check live/stream.mjs
    node --check live/send-model.mjs
