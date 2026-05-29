# Web Search & Fetch

The `/dev/web` device provides web search and page fetch capabilities to agents through two VFS tools: `WebSearch` and `WebFetch`.

---

## Overview

```
Agent Process
    │
    │  Open("/dev/web")
    ▼
VFS DeviceRegistry → /dev/web
    │
    ├── WebSearch(query, domains?, max_results?) → Tavily / Exa / SearXNG
    └── WebFetch(url, prompt?) → Markdown
```

Agents access web capabilities through standard VFS operations. The device auto-detects available backends on daemon startup.

---

## Quick Start

Set one environment variable and the daemon auto-detects the backend:

| Backend | Env Var | Notes |
|---------|---------|-------|
| **Tavily** | `TAVILY_API_KEY` | Free tier at [tavily.com](https://tavily.com) |
| **Exa** | `EXA_API_KEY` | Paid; research-grade quality |
| **SearXNG** | `RNIX_SEARCH_URL` | Self-hosted, e.g. `http://localhost:8888` |

**Auto-detection priority** (when multiple are set): `TAVILY_API_KEY > EXA_API_KEY > RNIX_SEARCH_URL`

Check daemon logs for confirmation:

```
[web] search backend auto-detected: tavily
```

---

## Explicit Configuration: `web-search.yaml`

For multi-backend setups or fine-grained control, create a YAML config at one of:

1. `<project>/.rnix/web-search.yaml` (project, takes priority)
2. `~/.config/rnix/web-search.yaml` (global)

```yaml
version: "1"
default_backend: tavily
backends:
  - name: tavily
    driver: tavily
    api_key_env: TAVILY_API_KEY
    max_results: 5
    search_depth: basic            # basic | advanced

  - name: exa
    driver: exa
    api_key_env: EXA_API_KEY
    num_results: 5

  - name: local-searxng
    driver: searxng
    base_url: http://localhost:8888
```

The project file fully overrides the global file (no merging). API keys are resolved from project `.env` files before falling back to the host environment — never store keys in the YAML itself.

---

## Backend Behavior

### Tavily

- **Search depth**: `basic` (faster) or `advanced` (more comprehensive)
- **Domain filters**: Server-side `include_domains` / `exclude_domains`
- **Free tier**: Rate-limited; upgrade for production use

### Exa

- **Quality**: Research-grade, higher relevance for technical queries
- **Domain filters**: Server-side `includeDomains` / `excludeDomains` (camelCase)
- **Pricing**: Paid only, no free tier

### SearXNG

- **Privacy**: Self-hosted, no third-party API dependency
- **Domain filters**: `site:` operators in query + client-side filtering for blocked domains
- **Setup**: Requires running SearXNG instance

---

## Domain Filters

Both `WebSearch` tools accept `allowed_domains` and `blocked_domains` arrays. Agents can use these to scope searches:

```
Tool call: WebSearch({
  query: "Go concurrency patterns",
  allowed_domains: ["go.dev", "github.com/golang"],
  blocked_domains: ["medium.com"]
})
```

Filtering behavior varies by backend — see [Backend Behavior](#backend-behavior) above.

---

## Error Handling

| Symptom | Fix |
|---------|-----|
| `WebSearch backend not configured...` | Set one of the three env vars, or write `web-search.yaml` |
| `tavily: HTTP 401` / `exa: HTTP 401` | API key invalid or revoked — verify the env var value |
| `tavily: HTTP 429` | Free-tier rate limit — wait or upgrade |
| `[web] backend X skipped: missing API key` | YAML lists backend X but its `api_key_env` resolves empty |

Errors surface to the agent as `DriverError` — the LLM can choose to retry, switch strategy, or surface a config hint. There is no silent failure path.

---

## Using Web Tools in Skills

Add `/dev/web` to a skill's `allowed-tools` to enable web access:

```yaml
---
name: web-research
description: "Search the web for technical information"
allowed-tools: /dev/web /dev/fs
---
```

Agents with this skill can then invoke `WebSearch` and `WebFetch` during reasoning.

---

## stracing Web Operations

```bash
$ rnix strace 1
[  3.421s] Open("/dev/web") → FD(5)
[  3.423s] Write(FD(5), {"tool":"WebSearch","query":"Go generics tutorial"}) → ok  1200ms
[  4.623s] Read(FD(5), 65536) → [{"title":"...","url":"...","snippet":"..."}]  1ms
[  4.625s] Write(FD(5), {"tool":"WebFetch","url":"https://go.dev/doc/tutorial/generics"}) → ok  800ms
[  5.425s] Read(FD(5), 65536) → "# Tutorial: Getting started with generics..."  2ms
[  5.428s] Close(FD(5)) → ok
```

---

## Related Documentation

- [Configuration](/guide/configuration) — `web-search.yaml` details
- [Core Concepts](/guide/concepts) — VFS device model
- [LLM Providers](/guide/llm-providers) — Provider configuration
