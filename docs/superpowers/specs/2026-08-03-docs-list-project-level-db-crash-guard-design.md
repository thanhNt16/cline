# Docs List + Project-Level DB MCP + Crash Guard — Design

**Date:** 2026-08-03
**Status:** Approved (brainstorming)
**Scope:** three independent items on the Cline extension host + webview.

## 1. List uploaded documents with download link

### Goal
In the "Document Indexing" tab, after selecting a project, list every uploaded
document with a downloadable link, so the user can see which documents they have
uploaded.

### API (verified live at http://10.60.70.4:8080)
- `GET /projects/{project}/documents` → `{ "documents": [ { "source", "bytes", "page_count", "chunk_count", "content_hash", "url" } ] }`
- `GET /projects/{project}/documents/{source}/file` → returns the original file bytes.

### Backend (mirror existing `listProjects` pattern)
- `VesselIndexerClient.listDocuments(project)` → fetch `GET /projects/{project}/documents`; throw on `!response.ok`.
- `proto/cline/docs_index.proto`: add `listDocuments` RPC + `ListDocumentsRequest`/`ListDocumentsResponse` + `DocumentInfo` message (`source`, `bytes`, `page_count`, `chunk_count`, `content_hash`, `url`). Regen the three generated bundles (grpc-js, nice-grpc, shared).
- `DocsIndexFacade.listDocuments(serverUrl, project)` → wrap client, map to proto `DocumentInfo`, `try/catch` → `documents: []` on error (matches `listProjects`).

### Webview
- New `DocumentsCard.tsx` under `docs-index/`, rendered in `DocsIndexSection` after `ProjectsCard`.
- Table of the selected project's documents (Minimal: filename `source` + download link).
- "Download" opens the server URL `…/{project}/documents/{source}/file` in the browser via `window.open` (user chose "Open in browser").
- Reloads when `selectedProject` or `connected` changes; empty state when no docs.
- No size/page metadata, no delete button (YAGNI; delete already exists server-side, not requested).

## 2. Database MCP server saved at project level

### Root cause
`McpHub.addStdioServer` → `resolveMcpWriteFilePath(serverName)` returns the
**global** `~/.cellockai/cline_mcp_settings.json` for new servers; the workspace
file is only used when the server already exists there. So the Database wizard
writes to global, contradicting its own UI text ("Saved to `.cellockai/mcp_settings.json`").

### Approach (scoped to Database wizard only)
- Thread a `projectLevel?: boolean` flag through the `addStdioMcpServer` RPC →
  `McpHub.addStdioServer` → `resolveMcpWriteFilePath`. When true, write to the
  workspace file (`getWorkspaceMcpSettingsFile()`).
- `AddDatabaseServerForm` sets `projectLevel: true` on the request.
- Only Database connections change behavior; all other MCP servers keep the
  current global default. Non-goal: making project-level the default for all servers.

## 3. Crash → "first screen" guard

### Symptom
User in a very long chat session is suddenly navigated to the first/onboarding
screen.

### Root cause (candidate)
Webview `ExtensionStateContext.tsx` (~line 485):
`if (!newState.welcomeViewCompleted && !showWelcome) setShowWelcome(true)`.
If a state push arrives without `welcomeViewCompleted` — e.g. an exception in
`getStateToPostToWebview`'s many unguarded `stateManager.getX()` calls, or a
coerced-to-undefined value — the app flips to onboarding. A "very long session"
matches a long-session state-build failure.

### Fix (defensive, no crash, no accidental nav)
- **Backend guard:** wrap `getStateToPostToWebview` so any throw produces a
  partial state with `welcomeViewCompleted: true` (never `false`/undefined) and
  logs the error via `Logger.error`. This alone stops the webview from flipping
  to onboarding.
- **Webview guard (belt-and-suspenders):** only flip to onboarding on an
  explicit `welcomeViewCompleted === false` (not `!newState.welcomeViewCompleted`),
  and never flip to `showWelcome=true` when the app is already hydrated with a
  task in progress. Durable "never navigate back to first screen unintentionally".
- **Error surfacing:** the thrown error is visible in the Extension Host output.

## Testing
- **Unit:** `databasePresets`/`AddDatabaseServerForm` already have tests; add a
  case asserting `projectLevel: true` is sent. `DocsIndexFacade.listDocuments`
  errors → empty array. Backend `getStateToPostToWebview` throw → partial state
  with `welcomeViewCompleted === true`.
- **Webview:** `DocumentsCard` renders the document list + download link; reloads
  on project change. `ExtensionStateContext` onboarding flip tests.
- **Manual smoke:** select a project with documents → list renders; download opens
  in browser. Add a DB server → lands in `<workspace>/.cellockai/mcp_settings.json`.