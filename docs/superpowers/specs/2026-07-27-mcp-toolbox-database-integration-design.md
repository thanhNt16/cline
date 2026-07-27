# mcp-toolbox Database Integration — Design

**Date:** 2026-07-27
**Status:** Approved (brainstorming)
**Scope:** v1 — PostgreSQL only, prebuilt tools

## Problem

Users want the AI agent to connect to a database. Cline already has a full MCP
client (`McpHub`) and an MCP settings panel, but adding a database today means
the user manually authors an MCP server entry. [mcp-toolbox](https://github.com/googleapis/mcp-toolbox)
exposes generic database tools (`list_tables`, `execute_sql`, …) over MCP via a
**prebuilt** mode that needs only connection params — no `tools.yaml`, no binary
install (`npx` fetches `@toolbox-sdk/server`).

## Goal

From the existing MCP settings panel, a "Connect Database" wizard lets the user
enter PostgreSQL connection details and registers a working MCP server that
exposes prebuilt Postgres tools to the agent.

## Non-goals (v1)

- Other databases (MySQL/SQLite/Mongo/Cloud DBs). MongoDB in particular has no
  prebuilt config and would require custom `tools.yaml` authoring.
- Custom `tools.yaml` / custom SQL tools.
- In-wizard editing of an existing connection (edit via settings JSON for now).
- OS keychain credential storage.
- Pre-save connection test.

## Background facts (verified)

- mcp-toolbox prebuilt Postgres is invoked as:
  ```json
  {
    "command": "npx",
    "args": ["-y", "@toolbox-sdk/server", "--prebuilt=postgres", "--stdio"],
    "env": {
      "POSTGRES_HOST": "...",
      "POSTGRES_PORT": "...",
      "POSTGRES_DATABASE": "...",
      "POSTGRES_USER": "...",
      "POSTGRES_PASSWORD": "..."
    }
  }
  ```
  Optional: `POSTGRES_QUERY_PARAMS`. `POSTGRES_HOST`/`POSTGRES_PORT` are optional
  (defaults `127.0.0.1` / `5432`); the rest are required.
- mcp-toolbox prebuilt tools are intended for **build-time / trusted-developer**
  use and expose dynamic `execute_sql`. The agent should run against a **read-only
  DB role**; this is a UX guardrail, not a security boundary.

## Architecture

**Approach A — thin UI over the existing stdio MCP RPC.** Pure frontend
addition; no backend change, no schema change, no new storage.

Existing chain (unchanged):

```
addStdioMcpServer RPC  →  McpHub.addStdioServer(name, command, args, env, cwd)
                         →  writes cline_mcp_settings.json (stdio entry)
                         →  spawns process, connects, lists tools
```

New: a wizard form builds the toolbox `command/args/env` from user fields and
calls the same `addStdioMcpServer` RPC. To Cline it is an ordinary stdio MCP
server; `McpHub` needs no awareness of mcp-toolbox.

## Components

1. **New** `webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.tsx`
   — the wizard form. Fields:
   - **Name** (default `toolbox-postgres`)
   - **Host** (default `127.0.0.1`) → `POSTGRES_HOST`
   - **Port** (default `5432`) → `POSTGRES_PORT`
   - **Database** (required) → `POSTGRES_DATABASE`
   - **User** (required) → `POSTGRES_USER`
   - **Password** (required, masked input) → `POSTGRES_PASSWORD`
   - Collapsed **Advanced**: `POSTGRES_QUERY_PARAMS`.
   - In-form security notice (see Error handling / Security).
   - Submit handler validates required fields, then calls `addStdioMcpServer`
     with the payload produced by `databasePresets.buildPostgres(fields)`.
2. `webview-ui/src/components/mcp/configuration/McpConfigurationView.tsx` — add a
   **"Database"** selection alongside the existing Local (stdio) and Remote
   options in the add-server view; render `AddDatabaseServerForm` when selected.
3. **New** `webview-ui/src/components/mcp/configuration/tabs/add-server/databasePresets.ts`
   — pure, side-effect-free builder. Exports:
   ```ts
   buildPostgres(fields): { serverName, command, args, env }
   // ponytail: ceiling — single preset today. MySQL/SQLite/Cloud DBs drop in
   // here later; when a second preset + in-wizard edit arrive, upgrade to
   // Approach B (a `_kind` marker + addDatabaseServer/editDatabaseServer RPCs).
   ```
   Centralizing the command/args/env map here keeps the upgrade to Approach B a
   localized swap.

## Data flow

```
Wizard form
  → validate required fields
  → databasePresets.buildPostgres(fields)  →  { command:"npx",
                                                args:["-y","@toolbox-sdk/server",
                                                      "--prebuilt=postgres","--stdio"],
                                                env:{ POSTGRES_* } }
  → existing addStdioMcpServer RPC
  → McpHub.addStdioServer
  → writes cline_mcp_settings.json:
      "toolbox-postgres": { command, args, env, type:"stdio",
                            disabled:false, autoApprove:[] }
  → McpHub spawns npx → toolbox connects to Postgres
  → list_tables / execute_sql / … appear under the server in the panel
  → agent may invoke them (user approves per tool; autoApprove stays empty)
```

## Editing

v1: edit an existing connection via the existing `openMcpSettings` flow (open
`cline_mcp_settings.json` and edit the env values). No in-wizard edit in v1.
`ponytail:` when a second DB type or in-form edit is needed, upgrade to
Approach B (marker field + dedicated edit RPC).

## Error handling

- **Form validation:** Database/User/Password required; Host/Port fall back to
  defaults. Inline errors, submit disabled until valid.
- **Connection failures** (wrong credentials, unreachable host) surface through
  the existing MCP server status — `McpHub` already reports connect failures and
  `ServerRow` already renders connected/failed. No new error path.
- **`npx`/Node missing:** surfaces via the same stdio spawn-error path as any
  other stdio MCP server. No special handling.
- **Security notice (in-wizard UI):** credentials are stored in plaintext in
  `cline_mcp_settings.json`, identical to every other MCP server's env today.
  Recommend a read-only Postgres role because prebuilt tools expose
  `execute_sql` (per mcp-toolbox's own build-time guidance). Link to mcp-toolbox
  prebuilt security docs.

## Security

- Plaintext credential storage is the **existing** MCP env pattern; this design
  introduces no new storage and does not weaken the current posture. A visible
  in-wizard warning makes the tradeoff explicit.
- `autoApprove: []` — the user must approve tool calls; we do **not** auto-enable
  `execute_sql`.
- Document the read-only-role recommendation in-wizard (build-time tooling,
  not a runtime security boundary).

## Testing

- **Unit** (the only non-trivial logic): a small test file asserting
  `databasePresets.buildPostgres` returns the exact `{ serverName, command, args, env }`
  for representative inputs (defaults applied, required fields, query params
  omitted when blank).
- **Webview:** extend `McpConfigurationView.test.tsx` — render
  `AddDatabaseServerForm`, fill fields, submit, assert `addStdioMcpServer` is
  called with the exact payload.
- **Manual smoke:** local or Docker Postgres → confirm the server connects and
  `list_tables` / `execute_sql` appear and execute.

## Open questions for the plan

- Exact `addStdioMcpServer` request shape (proto message name + fields) — confirm
  against `core/controller/mcp/addStdioMcpServer.ts` and
  `shared/proto/cline/mcp.ts` during planning.
- Whether the add-server view uses a tab or a type-selector; match the existing
  Local/Remote pattern found there.
