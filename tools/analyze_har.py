#!/usr/bin/env python3
"""Aggregate-only HAR analysis. Never print URLs, response bodies, or tokens."""
import collections
import datetime as dt
import json
import pathlib
import sys
import zipfile


def read_har(filename):
    path = pathlib.Path(filename)
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            names = [n for n in archive.namelist() if n.endswith(".har")]
            if len(names) != 1:
                raise ValueError("Expected exactly one .har file in ZIP")
            with archive.open(names[0]) as stream:
                return json.load(stream)
    with path.open("r", encoding="utf-8") as stream:
        return json.load(stream)


def analyze(data):
    log = data["log"]
    entries = log["entries"]
    types = collections.Counter(e.get("_resourceType", "unknown") for e in entries)
    caches = collections.Counter(e.get("_fromCache", "network/unknown") for e in entries)
    js = [e for e in entries if e.get("_resourceType") == "script"]
    css = [e for e in entries if e.get("_resourceType") == "stylesheet"]
    compressed = sum(
        max(0, e.get("response", {}).get("bodySize", -1))
        for e in entries
    )
    decoded_js = sum(
        max(0, e.get("response", {}).get("content", {}).get("size", 0))
        for e in js
    )
    pages = [
        {
            "dom_content_loaded_ms": round(p["pageTimings"].get("onContentLoad", -1)),
            "load_ms": round(p["pageTimings"].get("onLoad", -1)),
        }
        for p in log.get("pages", [])
    ]
    return {
        "requests": len(entries),
        "types": dict(sorted(types.items())),
        "cache": dict(sorted(caches.items())),
        "scripts": len(js),
        "scripts_from_memory": sum(e.get("_fromCache") == "memory" for e in js),
        "stylesheets": len(css),
        "stylesheets_from_memory": sum(e.get("_fromCache") == "memory" for e in css),
        "reported_body_bytes": compressed,
        "decoded_script_bytes": decoded_js,
        "pages": pages,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python tools/analyze_har.py recording.har[.zip]")
    print(json.dumps(analyze(read_har(sys.argv[1])), indent=2))
