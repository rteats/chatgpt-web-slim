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

## Bug reports / safe diagnostic logging

The Live Reader now has a **Скачать диагностический лог (.json)** button. Open the extension page, reproduce the issue, then download `web-slim-diagnostics.json` and send it directly to the developer in a private chat. It records only allowlisted operation types, HTTP status codes, durations and counts; no URLs, conversation IDs, message content, headers, cookies, request bodies or stack traces. It is kept in memory and is downloaded only on user request.

For any error not explained by the JSON diagnostics, also capture DevTools Console errors from the **Live Reader tab** (F12 → Console → Preserve log → reproduce → Save as). If a request fails, capture Network → Preserve log → **Export HAR (sanitized)** and inspect for identifiers/tokens before sharing. Do not publish any raw HAR, screenshot of private chats, or full trace publicly.

Tell the developer what action failed (connecting, opening a chat, older messages, plugin list), how often it happens, whether a clean-browser profile reproduces it, and whether the site itself works.


## Debugging an empty list (HTTP 200)

If the list shows zero chats while the regular site has conversations:

1. Press **Проверить текущую сессию**. The app requests GET /backend-api/me on demand.
2. Compare the *locally displayed, partially masked* email with the ChatGPT account you're using in the same browser profile.
3. Press **Подключиться / обновить список** once more.
4. Download **web-slim-diagnostics.json** and share it privately. Diagnostic records contain only HTTP status, error category, response MIME category, operation type, durations and counts. They contain **no account email** or chat content.
5. If the session matches but the list remains empty, open DevTools → Network on the extension page, click the GET /backend-api/conversations request and check its Response tab locally. Do **not** publish it: it contains conversation IDs and titles.

A 200 response with an empty JSON list is not a CORS error. A 200 HTML response in place of JSON can indicate an authentication redirect, an interstitial or an unexpected backend response. The extension cannot infer the exact cause without a reproducible response shape. It deliberately does not try to evade access controls or replay session tokens.


## Account routing fix (v0.2.3)

The original browser HAR included **ChatGPT-Account-ID** on successful history, profile, and plugin requests; the lightweight extension did not send this header. A successful GET /backend-api/me does not verify which workspace is selected. The HAR also showed that the account header equals the default_account_id returned by GET /backend-api/wham/accounts/check.

Web Slim now requests this session-scoped account list on demand, validates its default ID against the accessible membership list, and includes the account header on subsequent read-only requests. The account ID is held **in memory only** and is never included in exported diagnostics, source code, local storage, or URL parameters. Session refresh clears it. This may fix the 200 OK with zero conversations; it is a hypothesis pending real-browser validation.

After upgrading an unpacked extension: refresh the extension in chrome://extensions and **close/reopen the Live Reader tab**. Press Connect, then try Plugins. If a query fails, export a fresh diagnostic report. Please do not paste any actual account IDs or tokens.

To confirm root cause without exposing personal data, the diagnostics can now record account_resolved with the number of accessible workspaces, but never their identifiers.

## Current version 0.2.4 — one-time browser account capture

v0.2.3 incorrectly attempted to bootstrap workspace identity from GET /backend-api/wham/accounts/check, but the successful request in the original browser HAR **already carried ChatGPT-Account-ID**. Without it, the extension received HTTP 401 and none of its other requests ran.

v0.2.4 avoids that circular dependency: the extension passively observes only the `ChatGPT-Account-ID` header on a first-party request made by the official ChatGPT site. It does not read or store cookies, Authorization, bodies, messages, or unrelated headers, and it never modifies requests. The observed account selector is saved only to `chrome.storage.session` (memory-only, cleared when the extension reloads or the browser restarts). The standalone Live Reader can then reuse that account selector for its own user-triggered GET requests.

### One-time setup

1. Install/update the unpacked **live/** extension from this branch, then click Reload on chrome://extensions.
2. Open the **regular** https://chatgpt.com/ site in that same browser profile and open or switch a conversation. Wait for the chat list to load.
3. Open the **Live Reader** from the extension toolbar. The account status must say it was detected. Otherwise reload the regular site once and try again.
4. Press Connect. Then try a chat and plugins; download the diagnostic JSON if anything fails.

**Privacy/permissions:** v0.2.4 requests Chrome `webRequest` and `storage` permissions to observe just one first-party routing header. Unlike the earlier version it does not make an accounts/check request. The browser may still reject third-party extension-origin requests, and functionality must be validated in a real browser. The approach depends on an undocumented API, not a supported ChatGPT integration. Never submit a workspace/account ID publicly.

### Tests

    node --test live/api-tests.mjs live/protocol-tests.mjs live/diagnostics-tests.mjs live/account-capture-tests.mjs


## v0.2.5 — differential network diagnostics

**Reason:** In v0.2.4 the extension resolves an account and GET /backend-api/me returns HTTP 200, yet the conversation-list request returns 200 with 0 items (three attempts), while installed plugins return HTTP 451. This does not prove why the result differs from the successful first-party HAR, which showed 14–20 conversations.

**New test:** Click **Диагностика: сравнить сайт и расширение** in Live Reader. The extension performs one read-only GET from an existing signed-in chatgpt.com tab using an isolated content-script world, and one from its own extension page. Both use the same account selector and exactly the same list URL parameters. The UI and diagnostic download show only HTTP status, MIME category, item count and total. No raw response, chat titles, conversation IDs, content, cookies or auth headers are returned by the probe. This feature does not automatically poll and does not attempt to bypass access controls.

### Interpret results

- **Site 200 with nonzero items / extension 200 with zero items**: the distinction is extension-origin request context (credentials, cookies, request metadata or server policy) rather than a missing account selector alone.
- **Both 200 with zero items**: check whether the same browser account and query parameters are being compared; the server may legitimately respond with empty data for that context.
- **Site fails or is not available**: no root cause is established. The user should inspect the official site's normal behavior and not repeatedly probe a denial.
- **Plugins HTTP 451**: a server refusal. This UI disables plugin inventory retry for the remainder of the tab session rather than attempting to circumvent restrictions. The standard meaning of 451 is 'Unavailable For Legal Reasons', but the exact reason here is unknown without the server's explanation.

### Test steps

1. Download the new branch, update **live/** as an unpacked extension and Reload it on chrome://extensions. v0.2.5 adds a **scripting** permission in addition to the earlier **webRequest** and **storage** permissions.
2. Keep a normal, signed-in chatgpt.com tab open with a loaded conversation (same browser profile).
3. Reopen Live Reader; click **Диагностика: сравнить сайт и расширение** exactly once.
4. Compare the aggregate output shown in the UI and download web-slim-diagnostics.json.
5. Send only the diagnostic JSON in private chat, without raw HAR, chat IDs or response contents.

This is a controlled diagnostic feature rather than a claim of full live functionality. The replacement frontend still does not send messages.
