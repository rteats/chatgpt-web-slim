# Standalone frontend feasibility — November 2026

## What the warm-cache HAR demonstrated

The supplied recording had 312 requests, including these observed paths. These are **internal web app endpoints, not a supported public API**.

| Action | Observed path | Result shape |
|---|---|---|
| List dialogs | GET /backend-api/conversations | items, total, limit, offset |
| Open a dialog | GET /backend-api/conversations/{id} | conversation graph and metadata |
| Load earlier messages | GET /backend-api/conversations/{id}, with before query | messages, page_info |
| Load models | GET /backend-api/models | models, default_model_slug |
| Initialize chat | POST /backend-api/conversation/init | session/UI model limits and settings |
| Get account metadata | GET /backend-api/me | user metadata |

The recording covered *opening and browsing chats*, not sending text and streaming replies, file upload flows or complex tools. Captured paths may be changed or rejected by OpenAI at any time.

## Alternatives and constraints

1. **Custom UI as overlay extension**: authentication, history, Plus subscription remain in the official app, but original bundles and React still load; limited startup benefit. Our extension experiment lives in PR #1.
2. **Replacement frontend on the private web backend**: potentially much faster, but no supported third-party contract. A separately hosted client cannot assume access to the original site's cookies or CORS permission. Integrating auth, anti-abuse, streaming, and rapidly evolving rich responses adds substantial fragility and potential terms issues.
3. **Independent export reader**: implemented on this branch. Fast lightweight frontend reads the official export locally. No live sync, no generation, no subscription access. It can serve as a renderer and benchmark baseline without scraping or violating session boundaries.
4. **Independent app plus official Responses API**: stable supported integration for new chats. API usage has separate billing and does not inherit the ChatGPT history or Plus subscription.

The project must not use HAR-captured credentials, hardcode cookies, automate extraction, bypass Cloudflare challenges or silently relay private conversation data.

## Proposed client architecture

- Keep rendering, message model, and backend adapters separate. Support an ExportAdapter today; a DocumentedApiAdapter later if approved.
- Keep long conversations memory-friendly with small DOM windows, retain scroll position on older-message loads.
- Move heavy parsing into a Web Worker and use stable, scoped CSS to prevent synchronous layout churn.
- Normalize message branches, separate text from attachments, treat all backend/export content as untrusted.
- A future API key should be stored server-side, never embedded in the browser bundle.
- Benchmark startup, warm chat switch, CPU long tasks, Layout, and memory against original ChatGPT with identical conversations and viewport. No performance win claimed before A/B traces.

## Source documentation

- https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data
- https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform
- https://openai.com/policies/terms-of-use/

**Do not commit any private raw capture or actual account export.**
