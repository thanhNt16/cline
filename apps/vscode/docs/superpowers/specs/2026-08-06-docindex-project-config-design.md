# Docindex — Project-Level Config + Agent Auto-Scoped Search

**Date:** 2026-08-06
**Branch:** `cellockai-fork`
**Status:** Design (pending approval)

## Problem

Today the Document Index settings — `serverUrl` and the selected project name — are stored **globally** at `~/.cellockai/docs_index.json` (keyed by absolute workspace path inside `lastProjects`), and the `vessel-indexer` MCP server entry is registered **globally** in `~/.cellockai/cline_mcp_settings.json`. Two consequences:

1. Config is not portable per project; it lives in the user's global home dir.
2. The agent does **not** know the selected project name. The MCP server is remote (`streamableHttp`), its `search` tool schema is defined server-side, and `McpHub.callTool` passes tool arguments verbatim — so the model must guess and re-pass `project` on every search call.

Additionally the server name has drifted: the code constant is `vessel-indexer` while the live global config uses `server-docs-index`.

## Goals

1. Persist docindex config (server URL + selected project name) at **project level** under `<workspace>/.cellockai/`, with the global file as a fallback base.
2. The agent automatically uses the persisted project name when calling the docindex MCP `search` tool — no per-turn re-specification.
3. Unify the MCP server name to **`docindex`** and clean up legacy names.

## Non-Goals (YAGNI)

- System-prompt duplication of the project name (the `callTool` default is authoritative).
- A "project-scoped" indicator in the settings UI.
- Multi-root secondary-root support (primary root wins, consistent with `getProjectSettingsDirectoryPath`).
- Forced migration of existing global `lastProjects` into workspace files (global stays as base; workspace overrides lazily).

## Decisions (locked via brainstorming)

- **Agent injection:** `callTool` arg-default (auto-fill `project` when the model omits it; never override an explicit value).
- **Storage layering:** global base + workspace override (workspace wins per key) — mirrors the existing `profiles` + MCP layering.
- **MCP server name:** `docindex` (replaces `vessel-indexer` / `server-docs-index`).

## Architecture

### 1. Storage — global base + workspace override

**New helper** (`src/core/storage/disk.ts`, sibling of `getGlobalDocsIndexSettingsFilePath` ~L328):

```ts
export async function getProjectDocsIndexSettingsFilePath(): Promise<string> {
  return path.join(await getProjectSettingsDirectoryPath(), "docs_index.json")
}
```

`getProjectSettingsDirectoryPath()` (disk.ts:190) already resolves `<primaryRoot>/.cellockai/`, creates it, and falls back to the global settings dir when no workspace folder is open.

**`DocsIndexSettingsService`** (`src/services/docs-index/DocsIndexSettingsService.ts`):
- `file()` becomes async (returns the workspace path; `get`/`update`/`setSelectedProject` already `await`).
- **Read (`get`):** read global `docs_index.json` (`{ serverUrl, lastProjects }`); read workspace `docs_index.json` if present (flat `{ serverUrl?, selectedProject }`); merge with **workspace winning per key**. Resolve `selectedProject` via the existing `selectProject` rule (basename → last → first).
- **Write (`update` / `setSelectedProject`):** writes go to the **workspace** file, flat shape `{ serverUrl?, selectedProject }`. The global file is left as the base.
- Merge semantics for `selectedProject`: workspace flat `selectedProject` overrides `global.lastProjects[workspacePath]`.

### 2. MCP server rename + project-scoped registration

**`MCP_SERVER_KEY`** (`src/services/docs-index/constants.ts:3`): `"vessel-indexer"` → `"docindex"`.

**`McpRegistrationService.register`** (`src/services/docs-index/McpRegistrationService.ts`):
- Write the `docindex` entry to the **workspace** `mcp_settings.json` via `resolveMcpWriteFilePath(MCP_SERVER_KEY, /* projectLevel */ true)` (the `projectLevel` flag already exists, `McpHub.ts:211`) when a workspace exists; global otherwise.
- Entry shape unchanged: `{ type: "streamableHttp", url: "${serverUrl}/mcp", disabled: false, autoApprove: [] }`.

**Legacy cleanup** (one-time, during `register`): remove any entries named `vessel-indexer` or `server-docs-index` from both global and workspace `mcp_settings.json` so the old names don't keep double-connecting to the same URL.

### 3. Agent injection — `callTool` arg-default

**`McpHub.callTool`** (`src/services/mcp/McpHub.ts`, ~L1947): before dispatching the tool call,

```ts
if (name === DOCINDEX_MCP_SERVER_NAME && toolName === "search") {
  const project = await this.resolveDocIndexProject?.()
  if (project && (!toolArguments || toolArguments.project == null)) {
    toolArguments = { ...(toolArguments ?? {}), project }
  }
}
```

- **Only fills when `project` is absent** (`null`/`undefined`/`""`). Never overrides an explicit value.
- **Wiring:** McpHub gains an optional injected resolver `resolveDocIndexProject?: () => Promise<string | undefined>`, set by `SdkController` (which owns both `McpHub` and `DocsIndexFacade`). McpHub stays decoupled from `DocsIndexSettingsService` internals and remains unit-testable. One function, no new abstraction.
- Per-call resolution — no server restart (project is a per-request REST path param, `VesselIndexerClient.search` → `POST /projects/{project}/search`).

### 4. UI — no change

`updateDocsIndexSettings` already carries `workspacePath` through the proto RPC; backend retargeting of writes is transparent to the webview. The init read returns the merged settings via the same RPC.

## Data Flow

```
Settings tab (ProjectsCard / ConnectionCard)
  ──grpc──> updateDocsIndexSettings RPC (workspacePath, serverUrl?, selectedProject?)
              └──> DocsIndexSettingsService.update  ──writes──> <workspace>/.cellockai/docs_index.json
              └──> McpRegistrationService.register  ──writes──> <workspace>/.cellockai/mcp_settings.json  (docindex entry)

Agent turn ──> model calls docindex `search` tool
  └──> McpHub.callTool("docindex", "search", args)
        ├── args.project missing?  resolveDocIndexProject() ──> DocsIndexSettingsService.get(workspacePath).selectedProject
        ├── inject project
        └── dispatch to remote MCP server
```

## Migration

- **Global `docs_index.json`:** unchanged on disk; remains the base layer. Workspace overrides take effect as the user re-selects per project. Nothing forced.
- **MCP legacy names:** `vessel-indexer` / `server-docs-index` entries removed during the next `register` (global + workspace). The new `docindex` entry is written at workspace scope.

## Testing

- `DocsIndexSettingsService.test.ts`: global+workspace merge (workspace wins per key); fallback to global when no workspace file; async file path resolution; `selectedProject` flat-override of `lastProjects[workspace]`.
- `McpHub` (new test or existing): `project` filled when omitted; preserved when present; no-op for non-`docindex` servers; resolver returning `undefined` → no injection.
- `McpRegistrationService` test: workspace entry written via `projectLevel: true`; legacy `vessel-indexer` / `server-docs-index` entries cleaned from global + workspace.

Existing tests to update: `McpRegistrationService.global.test.ts` (currently asserts global writes) and any test referencing `MCP_SERVER_KEY === "vessel-indexer"`.

## Risks / Notes

- `DocsIndexSettingsService` reads-modify-writes without a cross-process lock (existing `ponytail` ceiling) — the workspace file inherits the same caveat.
- Server-name rename: any external references to `vessel-indexer` (docs, remote config) need updating; the live user config is handled by the legacy cleanup.
- The remote `search` tool's param name is assumed `project` (per proto mirror + REST path); unverifiable from this repo but consistent across all existing call sites.
