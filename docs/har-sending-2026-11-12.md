# Sending, attachment, plugin HAR findings (12 November 2026)

Only **aggregate structure** is retained. NEVER commit the original HAR: it includes private conversations, temporary credentials, pre-signed upload links and anti-abuse tokens.

The 487-entry recording covers ~283 s. It contains three successful POST requests to /backend-api/f/conversation, with text/event-stream responses:
- Text-only send: JSON message envelope, streaming response.
- Image send: register file POST /backend-api/files, PUT content to server-issued signed URL, POST /backend-api/files/process_upload_stream, then the conversation request with multimodal message metadata.
- A text message carrying system_hints.

Request JSON fields include action, model, parent_message_id, messages, timezone, timezone_offset_min, client_prepare_state, local_function_names, supported_encodings, genui_state_snapshots, and client_contextual_info. Existing conversations include conversation_id. These are observed structures, not a guaranteed usable API specification.

The request POST /backend-api/f/conversation/prepare returns status and an opaque conduit_token. The conversation responses are SSE containing delta and delta_encoding. Some delta frames contain v.message snapshots; others contain v arrays of patches, with append and replace to paths such as /message/content/parts/0. Some patch frames omit the enclosing o:patch marker. Other events include input_message, message_marker, message_stream_complete, and conversation_detail_metadata.

**Do not concatenate all SSE data:** the stream contains system messages, internal channels, and non-text metadata. The live/stream.mjs decoder is offline/test-only and projects solely assistant final text.

GET /backend-api/ps/plugins/installed and POST /backend-api/ps/apps/batch confirm plugin inventory and app metadata retrieval. **Actual external tool invocation and response formats were not established** by these traces.

Successful POST /backend-api/f/conversation requests include an OpenAI-Sentinel-Chat-Requirements-Token. Separate /backend-api/sentinel/chat-requirements/prepare and /finalize requests exchange Turnstile/proof-of-work verification artifacts. A static captured token cannot be reused as an integration. The experiment deliberately does not automate challenge solving, bypass protective checks or replay captured credentials; live sending remains disabled.

Notes:
- Chromium host permissions can allow SameSite cookies on extension requests, but session and server-side authorization still need testing: https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
- The endpoints are undocumented and may change without notice. OpenAI Terms restrict programmatic extraction and bypassing protective measures: https://openai.com/policies/terms-of-use/

Tests: node --test live/protocol-tests.mjs

Next: validate read-only live browsing in the user's Chromium profile, benchmark performance against original site, and evaluate an officially supported generation adapter if live messaging becomes a requirement.
