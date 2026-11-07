# ChatGPT Web Slim

A small **Manifest V3 Chromium extension** for experimental, reversible performance tweaks on chatgpt.com. Not affiliated with OpenAI.

## Install (Chrome / Edge / Brave)

1. Download the source for this branch (GitHub **Code > Download ZIP**) and extract it.
2. Open chrome://extensions (or edge://extensions).
3. Enable **Developer mode**, choose **Load unpacked**, and select the folder containing manifest.json.
4. Reload chatgpt.com once; click the extension's toolbar icon for settings and diagnostics.

No build, package manager, API key, or login is needed. Install only from source you trust.

## What v0.1 does

- **Long-chat rendering:** when a page contains 24+ conversation turns, apply CSS content-visibility:auto to *distant, already measured* turns, preserving their measured approximate height. The active and last two turns are left untouched. Disabled by default until live A/B testing demonstrates a benefit; enable from the popup to experiment. If scrolling, find-in-page, keyboard navigation, or jumps become worse, switch it off in the popup.
- **Shorter transitions:** optional CSS tweak to reduce transition durations. Disabled by default. This affects appearance, not script execution.
- **Local diagnostics:** popup reports conversation turn count, number of contained turns, long tasks, an estimate of total blocking duration beyond 50ms per task, page event timings, and resource counts. No conversation contents, API responses, identifiers, or timestamps are persisted or sent.

The extension uses no request interception, no injected page-context hooks, no analytics, and no backend endpoints. It **cannot** eliminate ChatGPT's own initial JavaScript parsing, backend round trips, React rendering, or network operations.

## Baseline from a 2026-11-07 warm-cache HAR

The user-provided recording contains 312 requests, including 195 script requests. 178 scripts and 25 of 27 stylesheets loaded from browser memory cache. The recorded navigation's DOMContentLoaded was about 1.46s and window load about 2.50s. About 34.7 MB of *decoded* JavaScript bodies appear across the capture; this is not network bandwidth nor proof of CPU execution time. Chat switches and some sidebar/project data requests are still observable after the load event.

These are *observations*, not extension performance results. The HAR also contains multiple page references and includes actions after navigation. Never publish raw HARs; they may contain private conversation data or credentials.

## Benchmarking

1. Record a Chrome DevTools **Performance** trace with the optimizer enabled in a long conversation.
2. Disable **Optimize offscreen turns**, hard reload only if you intend to measure cold-cache startup, and repeat the same interaction with ordinary caching enabled.
3. Compare click-to-paint responsiveness, long tasks, scroll jumps, and memory. Run multiple repetitions and alternate test order. Some browser traces interfere with the page.
4. Evaluate short chats too. The intended effect is mainly on long, DOM-heavy conversations.

The popup metrics are approximate and not a controlled A/B study. Resource timing can include cross-origin limitations; zero transferSize is only a heuristic for caching. Long Tasks API coverage varies. Cached code still needs execution.

## HAR analyzer

Requires Python 3 and no dependencies:

    python tools/analyze_har.py /path/to/capture.har.zip

This outputs only aggregate counts and sizes, without URLs, headers, cookies, tokens, request bodies, or conversation text. Do not commit raw HARs.

## Validation

    node --test tests/smoke.mjs
    python -m py_compile tools/analyze_har.py

## Known limitations

- ChatGPT's DOM is not a stable public API. The selector article[data-testid^="conversation-turn-"] may change.
- Measuring turn boxes once during idle adds work; long content can change size afterward.
- CSS containment can affect scrolling/anchors, browser search, or accessibility and may offer no gain if ChatGPT already virtualizes its content.
- This release is an instrumented experiment, not a verified speedup. Prefer leaving the tweak disabled if measurement shows regressions.

## Next experiments

Collect repeatable Chrome Performance traces to distinguish network, hydration, scripts, layout, paint and conversation-message rendering. Only then consider more invasive route preloading or duplicate-request mitigation; those cannot be safely implemented by blind background fetches.
