# CellockAI Installation Guide

## Prerequisites

- **VS Code** 1.85+ or compatible editor (Cursor, Windsurf, etc.)
- **Node.js** 18+ (for MCP servers and extension runtime)

---

## 1. Install the Extension

### Option A: Install from VSIX (Recommended)

```bash
code --install-extension apps/vscode/cellock-ai-0.17.1.vsix
```

Or via VS Code UI: **Extensions → ... (ellipsis) → Install from VSIX...** → select `apps/vscode/cellock-ai-0.17.1.vsix`

### Option B: Install from VS Code Marketplace

Search for **CellockAI** in the Extensions pane and click **Install**.

### Verify Installation

Open VS Code, press `Cmd+Shift+P`, type `CellockAI: Open`. The CellockAI chat panel should appear in the side bar.

---

## 2. Configure Model Profiles

CellockAI uses **model profiles** stored in `<workspace>/.cellockai/profiles.json` to switch between different LLM backends.

Create `.cellockai/profiles.json` in your workspace root:

```json
{
  "activeProfileId": "180ddee5-9778-4b0f-afd5-3c2f38fe412d",
  "profiles": [
    {
      "id": "f3205c96-f7f5-4d44-9a4b-be7bb9467cd9",
      "name": "haiku",
      "baseUrl": "http://10.60.70.4:20128/v1",
      "modelId": "haiku",
      "apiKey": "sk-6db89dd1d6ea53a4-3jz4jf-801430d0"
    },
    {
      "id": "180ddee5-9778-4b0f-afd5-3c2f38fe412d",
      "name": "opus",
      "baseUrl": "http://10.60.70.4:20128/v1",
      "modelId": "opus",
      "apiKey": "sk-6db89dd1d6ea53a4-3jz4jf-801430d0"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `activeProfileId` | The profile used by default when the workspace opens |
| `profiles[].id` | Unique UUID for each profile |
| `profiles[].name` | Display name shown in the profile selector |
| `profiles[].baseUrl` | OpenAI-compatible API endpoint |
| `profiles[].modelId` | Model identifier passed to the API |
| `profiles[].apiKey` | API key for authentication |

### Switching Profiles

Open **Settings → API Configuration** and select your active profile from the dropdown, or edit `activeProfileId` directly in the JSON file.

---

## 3. Codebase Memory & Graph

The **Codebase Memory & Graph** tab indexes your codebase into a knowledge graph so the AI agent can search functions, trace call paths, and understand architecture.

### Step 1: Configure MCP Server

Ensure `.cellockai/mcp_settings.json` contains the `codebase-memory-mcp` entry:

```json
{
  "mcpServers": {
    "codebase-memory-mcp": {
      "command": "<path-to-codebase-memory-mcp-binary>",
      "args": [],
      "disabled": false
    }
  }
}
```

The binary is managed by CellockAI — if not yet installed, use the UI to download it (see below).

### Step 2: Open Settings → Codebase Index

Navigate to **Settings → Codebase Index** (gear icon → "Codebase Index" tab).

![Codebase Index tab placeholder](screenshots/codebase-index-tab.png)

### Step 3: Install Binary

If the binary is not installed, click **Install** in the **Status** card. The extension downloads the `codebase-memory-mcp` binary to `<extension-globalStorage>/cellockai.cellock-ai/codebase-memory-mcp/`.

![Status card with Install button placeholder](screenshots/codebase-memory-status.png)

After installation, the status shows:

| Check | Status |
|-------|--------|
| Binary | `installed (v0.x.y)` |
| Project | `not indexed` |
| MCP tools | `registered for agent` |
| Graph UI | `not running` |

### Step 4: Index Current Project

Click **Index Current Project** in the **Indexing** card. A log panel shows progress:

![Indexing progress placeholder](screenshots/codebase-memory-indexing.png)

Indexing extracts:
- **Functions and classes** — their signatures, parameters, and docstrings
- **Call graphs** — who calls whom, data flow between functions
- **Routes and APIs** — HTTP endpoints, async channel subscriptions
- **Imports and dependencies** — cross-file relationships

### Step 5: Browse the Graph

Click **View Graph in Browser** to open the 3D knowledge graph at `localhost:9749`:

![Graph visualization placeholder](screenshots/codebase-memory-graph.png)

### Step 6: Query via Agent

After indexing, your agent has these MCP tools available:

| Tool | Description |
|------|-------------|
| `search_graph` | Find functions, classes, routes by name or natural-language query |
| `trace_path` | Follow call chains (callers/callees) up/downstream |
| `get_code_snippet` | Read source code for any indexed function or class |
| `query_graph` | Run Cypher queries for complex structural patterns |
| `get_architecture` | Get high-level architecture overview with package clusters |

**Example agent prompt:**
> "Find all functions that call `sendMessage` and trace the data flow into it."

---

## 4. Document Indexing & Search

The **Document Indexing & Search** tab connects to a Vessel Indexer server for full-text and semantic search across documents, specs, and notes.

### Step 1: Start the Indexer Server

Start the Vessel Indexer server (requires [Vessel CLI](https://github.com/vessel-ai/vessel-cli) or a running instance):

```bash
# Example — your setup may vary
npx vessel-indexer@latest --port 8080
```

### Step 2: Configure MCP Server

`.cellockai/mcp_settings.json` should contain the `docindex` and `vessel-indexer` entries:

```json
{
  "mcpServers": {
    "docindex": {
      "type": "streamableHttp",
      "url": "http://localhost:8080/mcp",
      "disabled": false
    },
    "vessel-indexer": {
      "type": "streamableHttp",
      "url": "http://localhost:8080/mcp",
      "disabled": false
    }
  }
}
```

### Step 3: Open Settings → Document Index

Navigate to **Settings → Document Index** (gear icon → "Document Index" tab).

![Document Index tab placeholder](screenshots/docs-index-tab.png)

### Step 4: Connect

Enter the server URL (default `http://localhost:8080`) and click **Connect**:

![Connection card placeholder](screenshots/docs-index-connection.png)

The green indicator confirms connection.

### Step 5: Index Documents

The tab provides several indexing options:

- **Upload** — Upload files (PDF, markdown, text) directly
- **Index Batch** — Batch-index a directory of documents
- **Index** — Index from a URL or by crawling a documentation site

![Indexing controls placeholder](screenshots/docs-index-indexing.png)

### Step 6: Search

Use the **Search** card to query indexed documents. Results return relevant chunks with source context.

![Search results placeholder](screenshots/docs-index-search.png)

### Step 7: Available Agent Tools

After connecting, your agent has these tools:

| Tool | Description |
|------|-------------|
| `search_text` | Full-text search across all indexed documents |
| `get_snippet` | Retrieve the full text of a specific chunk |
| `search_graph` | Entity search over extracted knowledge graph |
| `trace_path` | Follow entity relationships through document corpus |

---

## 5. Real-World Scenarios

### Scenario A: Onboard onto a Large Codebase

**Problem:** New developer joins a team with a 500K+ line monorepo.

**Setup:**
1. Install CellockAI from VSIX
2. Index the monorepo via **Codebase Index → Index Current Project** (~5 min)
3. Open the graph to visualize module boundaries

**Daily workflow:**
- Ask "Show me the architecture of the payments module" — agent calls `get_architecture` and returns a package-level summary with interdependencies
- Ask "Who calls `chargeCreditCard`?" — agent traces 3 levels deep showing every caller, their modules, and argument shapes
- Ask "What edge cases does the checkout handler handle?" — agent queries the graph for functions called by the checkout handler, returning docstrings and error paths
- Ask "Where is the SQL query for user orders built?" — agent `search_graph` finds the exact function + file + line

**Value:** Days of code spelunking compressed into seconds of chat.

---

### Scenario B: Multi-Model Workflow (Cost Optimization)

**Problem:** Use a cheap/fast model for simple tasks and a powerful model for complex reasoning.

**Setup:**
1. Create two profiles (haiku and opus) in `.cellockai/profiles.json`
2. Set `haiku` as default for quick queries

**Daily workflow:**
- "Refactor this variable name" → haiku handles it in <1s
- "Design the architecture for a new billing system" → switch to opus for deep reasoning
- "Explain this error message" → haiku is sufficient
- "Review this security-critical diff" → switch to opus for thorough analysis

**Switching:** Open **Settings → API Configuration → Profile** dropdown — instant switch, no reload needed.

**Value:** Cut API costs ~80% while keeping peak capability on tap.

---

### Scenario C: Documentation-Driven Development

**Problem:** Internal documentation is spread across markdown files, Notion exports, and API specs.

**Setup:**
1. Start the Vessel Indexer server
2. Connect via **Document Index → Connection** card
3. Upload/batch-index all documentation directories
4. Index the codebase via **Codebase Index**

**Daily workflow:**
- Ask "What's the API contract for the user service?" → agent queries docs-index and codebase graph in parallel, cross-references implementation against docs
- Ask "Does the code match the spec for authentication?" → agent reads indexed spec + indexed code, compares, reports discrepancies
- Ask "Find all places where we deviate from the coding standards doc" → agent searches the doc for rules and the code graph for violations

**Value:** One chat interface to ask "what does the spec say?" and "what does the code do?" — no more context-switching between docs and IDE.

---

### Scenario D: Automated Code Review with Agent Tools

**Problem:** Catching subtle bugs needs deep understanding of downstream effects.

**Setup:**
1. Codebase indexed
2. Agent configured to use `trace_path` and `search_graph` autonomously

**Workflow:**
- Paste a diff into chat: "Review this change"
- Agent automatically calls `trace_path` on modified functions to find all callers
- Agent calls `get_code_snippet` on affected callers to understand impact
- Agent queries for test coverage of affected paths via `search_graph`
- Returns a review with downstream impact assessment, untested paths, and potential regressions

**Value:** Code review becomes impact-aware, catching regressions before they ship.

---

### Scenario E: Cross-Project Architecture Discovery

**Problem:** Your codebase has multiple services (frontend, API, worker, shared libraries) in separate repos.

**Setup:**
1. Index each repo (open each in VS Code, run **Index Current Project**)
2. Use cross-repo intelligence: each index captures internal routes and channels

**Workflow:**
- Ask "What happens when the frontend calls `/api/orders/create`?"
- Agent traces: frontend route → API HTTP endpoint → worker async channel → email service
- Each hop is a different repo, but the graph connects them through route/channel matching
- Result: an end-to-end flow diagram across all services

**Value:** Service boundaries disappear — agents reason across your entire system.

---

## File Reference

| File | Purpose |
|------|---------|
| `.cellockai/profiles.json` | Model profile definitions |
| `.cellockai/mcp_settings.json` | MCP server configurations |
| `.cellockai/mcp.json` | Project-level MCP merge source (optional) |
| `.cellockai/skills/` | Local skills directory |
| `.cellockai/rules/` | Project rules and instructions |
| `.cellockai/rules/workflows/` | Workflow definitions |
| `.cellockai/rules/hooks/` | Hook scripts |
| `.cellockai/sessions/history.json` | Session history |

## Troubleshooting

| Symptom | Likely Fix |
|---------|------------|
| "Profile not found" | Verify `activeProfileId` matches a profile `id` in `.cellockai/profiles.json` |
| MCP server disconnected | Check `.cellockai/mcp_settings.json` syntax; re-open settings to trigger reload |
| Codebase Memory binary not installing | Check network access to the download URL; manual install via Settings UI |
| Document Index not connecting | Ensure Vessel Indexer server is running on the configured port |
| Indexing very slow | Use "fast" index mode for initial pass; full mode for targeted analysis |
| Agent not using MCP tools | Ensure `mcpServerRegistered` shows as registered in Codebase Index status card |
