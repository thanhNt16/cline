---
name: mem-dashboard
description: Open the project's knowledge graph — interactive cognee UI (graph, search, add data) or static HTML snapshot. Trigger: /skill:mem-dashboard, "show knowledge graph", "visualize memory", "graph view", "open dashboard".
when_to_use: Visual inspection of the project KG, interactive search/query, or adding data through a UI.
user-invocable: true
disable-model-invocation: false
---

# mem dashboard

Two modes:

## Interactive UI (preferred)

```bash
~/Desktop/cognee/bin/mem ui
```

Starts the official cognee web UI (Next.js) at **http://localhost:3100**
with backend API on :8100. Features: interactive graph explorer, dataset
management, search/query, add data (remember) via UI, pipeline run history.

- First run downloads the frontend (~40MB) + `npm install` — takes a few
  minutes. Subsequent starts are fast (cached).
- MCP server inside the UI stack needs Docker — skipped if Docker isn't
  running (we use stdio MCP via `.mcp.json` anyway).
- Stop with Ctrl+C in the terminal where `mem ui` runs.

## Static HTML snapshot

```bash
~/Desktop/cognee/bin/mem dashboard
```

Renders `p-<project>`'s KG via `cognee.visualize_graph` to
`~/Desktop/cognee/dashboards/p-<project>.html` and opens it. Bounded subgraph
(seed nodes + 2-hop), ~20-60s. Good for a quick look or sharing a file.
