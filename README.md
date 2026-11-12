# ChatGPT Web Slim

Experiments toward a genuinely responsive, minimal ChatGPT interface. Not affiliated with OpenAI.

## Independent frontend spike

This branch contains a **lightweight, standalone, read-only viewer of official ChatGPT exports**. It does not use ChatGPT's private APIs, does not intercept cookies or authentication, and does not send or receive messages in your live ChatGPT account. It demonstrates the UI architecture while preserving the option to add a supported backend adapter later.

### Run (Windows, Python 3)

1. Download this branch as a ZIP; extract it.
2. In PowerShell, from the extracted root directory, run:

    py -m http.server 8765 --directory client

3. Open http://localhost:8765/
4. Import **client/demo.json** to test the UI, or request and unzip an official ChatGPT data export through **Settings → Data controls → Export data**, then select its **conversations.json**.
5. Stop the local server with Ctrl+C.

No dependencies, build, installation, API key, or extra services. The browser runs the viewer, and a Web Worker parses the export off the UI thread. No content is persisted. All imported content is kept in memory until the page closes. The CSP prohibits network requests.

### What works

- Lists conversations, sorts by update time, and filters titles (Ctrl+K).
- Follows the export's selected conversation branch.
- Displays only the latest 30 messages initially; older messages load in batches.
- Renders exported text as safe text to prevent HTML injection.
- Uses plain browser APIs, no React, no UI framework.

### What does not yet work

Live account sync, streaming generation, ChatGPT Plus/Pro subscription access, files/images/voice rendering, Markdown formatting, Projects and plugins, or a send button. **This is an independent frontend proof of concept, not a replacement ChatGPT client.** Large exports and scroll behavior still need real-browser performance benchmarks.

### Tests

    node --test client/tests.mjs
    node --check client/app.mjs
    node --check client/worker.mjs

### Important limitations

The user-supplied HAR revealed read endpoints of ChatGPT's *undocumented web backend*, but did not show the complete send-message/stream protocol. A localhost page cannot assume same-origin cookie access, CORS, or a stable third-party ChatGPT session. OpenAI's Terms also restrict reverse engineering and programmatic extraction. Do not store HAR cookies/tokens or blindly replay them.

For a robust interactive standalone client, use a **documented API**. OpenAI's API has separate billing and does not automatically synchronize your ChatGPT history or include use of your ChatGPT Plus subscription.

See [feasibility notes](docs/feasibility.md).

### Privacy

Do **not** commit raw HARs, Chrome traces, ChatGPT exports, cookies, or private conversation data to this public repo. All demo content is synthetic.
