# Codebase-Memory-MCP Integration Design

**Goal:** Add codebase-memory-mcp as a built-in indexer to the Cline VS Code extension, exposed as a new "Codebase Memory" tab in the Settings view. The tab lets the user index the current workspace, watch live indexing progress, view the resulting knowledge graph in a browser, see the 14 MCP tools the agent now has access to, and re-index on demand. After a successful index, the binary is auto-registered as an MCP server so the agent gains the 14 structural code-intelligence tools during coding tasks.

**Architecture:** A new gRPC service (`CodebaseMemoryService`, 6 RPCs defined in `proto/cline/codebase_memory.proto`) bridges the React webview and an extension-host service layer. The host layer is four focused units under `src/services/codebase-memory/` — `BinaryManager` (download/verify/locate the static binary), `IndexingService` (spawn the CLI, stream stdout as progress events), `GraphServerService` (lifecycle for the `--ui=true` graph server on port 9749), and `McpRegistrationService` (write the MCP settings entry via the existing `settingsLock` infrastructure) — coordinated by a thin `CodebaseMemoryFacade`. The binary is auto-downloaded from GitHub releases into the extension's global storage on first index. Indexing progress is streamed live to the webview via a gRPC server-streaming RPC, matching the existing `subscribeToMcpServers` streaming pattern.

**Tech Stack:** TypeScript (VS Code extension host + React webview), Protocol Buffers / gRPC (existing protobus codegen via `bun run protos`), Node.js `child_process.spawn` for CLI invocation, the `tar` package (already a workspace dependency) for archive extraction, vitest for unit tests, biome for lint.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Binary distribution | Auto-download on first use | Zero user setup; ~15MB one-time download into extension global storage |
| MCP server integration | Auto-register as MCP server after first successful index | Gives the agent all 14 structural tools during coding tasks; reuses existing `McpHub` watcher for connection |
| Graph visualization | Open in external browser | `codebase-memory-mcp --ui=true` serves localhost:9749; VS Code `env.openExternal` opens it. Avoids CSP/iframe complexity. |
| Indexing progress | Stream CLI stdout live | `codebase-memory-mcp cli index_repository` prints per-file progress; stream line-by-line via gRPC server-streaming RPC |
| Indexing scope | Current workspace folder only | Single "Index Current Project" button; reads `vscode.workspaceFolders[0]` |
| "See available tools" | Static reference list of the 14 MCP tools | Read-only list with name + description, confirming what the agent can now do |
| Architecture approach | Focused multi-service (Approach A) | Four single-purpose units + thin facade; matches existing `McpHub`/`McpOAuthManager`/`settingsLock` split |

## Architecture Overview

The feature adds a **Codebase Memory tab** to the existing Settings view (`SettingsView.tsx`), placing it alongside the API Config, Features, Terminal, General, and About tabs. It is a single new tab (not a separate top-level view like the MCP Servers view) because it is a settings-grade concern: index the current project, see progress, view the graph, see the available tools.

```
┌─────────────────────────────────────────────────────────┐
│  webview-ui (React)                                      │
│  components/settings/sections/CodebaseMemorySection.tsx  │
│    • "Index Current Project" button                      │
│    • Live streaming progress (lines from CLI)            │
│    • "View Graph" button → opens external browser        │
│    • "Re-index" button                                   │
│    • Static reference list of 14 MCP tools               │
└───────────────┬─────────────────────────────────────────┘
                │ gRPC (generated from proto/cline/codebase_memory.proto)
                ▼
┌─────────────────────────────────────────────────────────┐
│  extension host (Node.js)                                │
│  core/controller/codebase-memory/                        │
│    getStatus.ts   indexProject.ts   reindexProject.ts    │
│    viewGraph.ts   stopGraphServer.ts listTools.ts        │
│                                                          │
│  services/codebase-memory/                               │
│    BinaryManager.ts       IndexingService.ts             │
│    GraphServerService.ts  McpRegistrationService.ts      │
│    CodebaseMemoryFacade.ts  types.ts  constants.ts       │
└─────────────────────────────────────────────────────────┘
                │ child_process.spawn
                ▼
┌─────────────────────────────────────────────────────────┐
│  codebase-memory-mcp binary (downloaded to ext storage)  │
│    • cli index_repository (streaming stdout)             │
│    • --ui=true (background graph server on :9749)        │
│    • registered as stdio MCP server for the agent        │
└─────────────────────────────────────────────────────────┘
```

**Key design choices:**
1. One new proto file (`codebase_memory.proto`) defines the gRPC contract between webview and extension host — same pattern as `mcp.proto`.
2. Streaming RPC for indexing progress — `indexProject` returns a stream of `IndexProgressEvent` messages, one per parsed stdout line, matching how `subscribeToMcpServers` streams.
3. Binary lives in extension global storage (`context.globalStorageUri`), one copy per extension install, reused across workspaces.
4. MCP registration is automatic after first successful index — writes the server entry into the same MCP settings file the existing MCP UI manages, so the agent picks it up via the existing `McpHub` watcher. The entry points at the downloaded binary path.
5. Graph server is lazy-started — only spawned when the user clicks "View Graph", and stopped when the tab closes or extension deactivates. No always-running background process.

## gRPC Contract (proto/cline/codebase_memory.proto)

A new proto file defines six RPCs. This is the wire contract between the React webview and the extension host — same pattern as `mcp.proto`. After editing, `bun run protos` regenerates the TS types and webview client. The six RPCs are: `getStatus`, `indexProject` (streaming), `reindexProject` (streaming), `viewGraph`, `stopGraphServer`, and `listTools`.

```protobuf
syntax = "proto3";
package cline;
import "cline/common.proto";

service CodebaseMemoryService {
  // Unary: returns current status (binary present? indexed? graph server running?)
  rpc getStatus(EmptyRequest) returns (CodebaseMemoryStatus);

  // Streaming: indexes the workspace, streams progress lines + final result
  rpc indexProject(IndexProjectRequest) returns (stream IndexProgressEvent);

  // Streaming: re-indexes the previously indexed project (refresh)
  rpc reindexProject(EmptyRequest) returns (stream IndexProgressEvent);

  // Unary: opens the graph UI in external browser (starts server if needed)
  rpc viewGraph(EmptyRequest) returns (ViewGraphResponse);

  // Unary: stops the graph server if we started it (called on tab unmount)
  rpc stopGraphServer(EmptyRequest) returns (Empty);

  // Unary: returns the 14 MCP tool names + descriptions (static reference)
  rpc listTools(EmptyRequest) returns (CodebaseMemoryTools);
}

message IndexProjectRequest {
  Metadata metadata = 1;
  string repo_path = 2;   // workspace folder path
}

message CodebaseMemoryStatus {
  bool binary_installed = 1;
  optional string binary_version = 2;
  optional string binary_path = 3;
  bool is_indexed = 4;            // project has been indexed at least once
  optional string indexed_project_name = 5;
  optional int64 indexed_node_count = 6;
  optional int64 indexed_edge_count = 7;
  optional int64 indexed_at = 8;  // unix timestamp of last index
  bool graph_server_running = 9;
  bool mcp_server_registered = 10;  // entry present in MCP settings
}

message IndexProgressEvent {
  enum Level {
    INFO = 0;
    WARN = 1;
    ERROR = 2;
    DONE = 3;   // terminal — carries final counts
  }
  Level level = 1;
  string message = 2;             // one line of CLI stdout/stderr
  optional int64 node_count = 3;  // set on DONE
  optional int64 edge_count = 4;  // set on DONE
}

message ViewGraphResponse {
  string url = 1;   // the URL actually opened (http://localhost:9749 or fallback port)
}

message CodebaseMemoryTool {
  string name = 1;
  string description = 2;
}

message CodebaseMemoryTools {
  repeated CodebaseMemoryTool tools = 1;
}
```

**How the webview uses each:**
- `getStatus` — called on tab mount to populate the status card (binary installed, project indexed, etc.). Also called after `indexProject` and `viewGraph` complete to refresh state.
- `indexProject` — streaming; the webview passes the workspace folder path. Each `IndexProgressEvent` appends a line to the progress log. On `DONE`, the webview re-calls `getStatus` to refresh counts.
- `reindexProject` — same stream contract; re-runs `index_repository` on the same project (the facade remembers the last indexed repo path).
- `viewGraph` — host ensures the `--ui=true` server is running, then opens the returned URL in the user's default browser via VS Code's `env.openExternal`.
- `stopGraphServer` — called when the CodebaseMemory tab unmounts, so we don't leave a background process running.
- `listTools` — returns the static 14-tool list (defined as a constant in `constants.ts` on the host, not fetched from the binary — they are known upstream).

**Why a streaming RPC for indexing:** the existing `subscribeToMcpServers` already establishes the streaming pattern (see `grpc-handler.ts` `handleStreamingRequest` and the generated client `makeStreamingRequest`). Reusing it gives live line-by-line progress without polling.

## Extension-Host Service Layer

Four focused units under `src/services/codebase-memory/`, coordinated by a thin facade. Each has one responsibility and a clear interface.

### `BinaryManager.ts`
Owns: binary discovery, download, version check.

```typescript
export class BinaryManager {
  constructor(private storageDir: Uri, private platform: string, private arch: string) {}

  // Returns path to the cached binary, or undefined if not installed.
  getBinaryPath(): string | undefined

  // Downloads the correct archive from GitHub releases for platform/arch,
  // verifies SHA-256 against checksums.txt, extracts, makes executable,
  // returns the binary path. Throws on network/checksum failure.
  // Emits progress via the optional onProgress callback (download %).
  ensureBinary(onProgress?: (pct: number) => void): Promise<string>

  // Parses `codebase-memory-mcp --version` output. Returns undefined if
  // binary missing or version unreadable.
  getInstalledVersion(): Promise<string | undefined>

  // Checks GitHub releases latest tag against installed version.
  isUpdateAvailable(): Promise<boolean>
}
```

**Download details:** hits `https://github.com/DeusData/codebase-memory-mcp/releases/latest`, reads `checksums.txt`, downloads `codebase-memory-mcp-<os>-<arch>.tar.gz`, verifies SHA-256, extracts via the `tar` package (already in workspace overrides at `^7.5.2`). Stores at `${storageDir}/codebase-memory-mcp/cbm`. Platform/arch derived from `process.platform` + `process.arch` and mapped to the release naming (`darwin`/`linux`/`windows` + `arm64`/`amd64`).

### `IndexingService.ts`
Owns: spawning the CLI for indexing, streaming output.

```typescript
export type ProgressHandler = (event: IndexProgressEvent) => void

export class IndexingService {
  constructor(private binaryPath: () => string, private progress: ProgressHandler) {}

  // Spawns: `cbm cli index_repository '{"repo_path":"<path>"}'`
  // Streams each stdout/stderr line as an IndexProgressEvent (INFO/WARN/ERROR).
  // On clean exit, parses final node/edge counts from the CLI's JSON output
  // and emits a DONE event. On non-zero exit, emits an ERROR event.
  indexProject(repoPath: string): Promise<void>

  // Same as indexProject but uses the last-indexed repo path (stored by facade).
  reindexProject(): Promise<void>

  // Kills any in-flight indexing child process.
  cancel(): void
}
```

**Why CLI mode not MCP tool:** the `index_repository` MCP tool blocks with no progress output, and McpHub connections are not established yet at index time (registration happens *after* first index). CLI mode gives line-by-line stdout we can stream directly. The CLI's final JSON line carries node/edge counts we parse for the DONE event.

### `GraphServerService.ts`
Owns: lifecycle of the `--ui=true` background process.

```typescript
export class GraphServerService {
  constructor(private binaryPath: () => string) {}

  // Spawns `cbm --ui=true --port=9749` if not already running.
  // Resolves when the HTTP server responds on the port.
  start(): Promise<void>

  // Returns true if the UI process is alive and port responds.
  isRunning(): boolean

  // Stops the UI process if we started it.
  stop(): void

  // Returns the URL (http://localhost:9749) or undefined if not running.
  getUrl(): string | undefined
}
```

**Lazy lifecycle:** started only on `viewGraph` RPC. Stopped on extension deactivation (`Controller.dispose`) and when the CodebaseMemory tab unmounts (via the `stopGraphServer` RPC). Port 9749 is the upstream default; we check whether it is free before starting. If 9749 is in use but not responding as the graph UI, fall back to 9750, then 9751, and report the actual URL via `ViewGraphResponse.url`.

### `McpRegistrationService.ts`
Owns: writing the codebase-memory-mcp entry into Cline's MCP settings file.

```typescript
export class McpRegistrationService {
  constructor(private mcpHub: McpHub, private binaryPath: string) {}

  // Reads the MCP settings file; returns true if a "codebase-memory-mcp"
  // entry with matching binary path exists.
  isRegistered(): Promise<boolean>

  // Adds the entry:
  //   "codebase-memory-mcp": { "command": "<binaryPath>", "args": [], "disabled": false }
  // Uses the existing updateMcpSettingsFile() from services/mcp/settingsLock.ts
  // for atomic write. Idempotent — no-op if already present.
  register(): Promise<void>

  // Removes the entry. Called if user uninstalls the binary.
  unregister(): Promise<void>
}
```

**Why delegate to existing infra:** `updateMcpSettingsFile` (in `services/mcp/settingsLock.ts`) already handles atomic, locked writes to the MCP settings JSON. The `McpHub` file watcher auto-detects the change and connects the new server — no extra wiring. This reuses the existing MCP plumbing instead of duplicating it.

### `CodebaseMemoryFacade.ts`
Thin coordinator — the only thing the gRPC controllers import.

```typescript
export class CodebaseMemoryFacade {
  private binaryManager: BinaryManager
  private indexingService: IndexingService | undefined  // created post-ensure
  private graphServer: GraphServerService
  private mcpRegistration: McpRegistrationService
  private lastIndexedRepo: string | undefined

  constructor(private context: ExtensionContext, private mcpHub: McpHub) {}

  // Called by getStatus RPC.
  getStatus(): Promise<CodebaseMemoryStatus>

  // Called by indexProject RPC. Ensures binary, runs index, registers MCP,
  // streams progress via the passed handler.
  indexProject(repoPath: string, onProgress: ProgressHandler): Promise<void>

  reindexProject(onProgress: ProgressHandler): Promise<void>

  // Ensures graph server running, opens URL in external browser, returns URL.
  viewGraph(): Promise<string>

  stopGraphServer(): void

  // Static tool list (constant from constants.ts).
  listTools(): CodebaseMemoryTool[]

  dispose(): void  // stops graph server, cancels any indexing
}
```

**Coordination logic in `indexProject`:**
1. `binaryManager.ensureBinary()` — download if missing (emits INFO progress events for download progress)
2. `indexingService = new IndexingService(...)` then `indexProject(repoPath)` — streams progress
3. On successful DONE: `mcpRegistration.register()` — adds MCP entry so agent gets the 14 tools
4. Stores `lastIndexedRepo` for `reindexProject`

### Supporting files
- `types.ts` — shared TS types (Platform, DownloadProgress, etc.) not in proto
- `constants.ts` — the 14-tool static list (name + description, sourced from the upstream GitHub README), GitHub release URL, default port 9749, binary subdirectory name

**Wiring into the extension:** the `Controller` class in `apps/vscode/src/sdk/SdkController.ts` gets a `codebaseMemory: CodebaseMemoryFacade` property, instantiated in the controller constructor alongside `mcpHub`. gRPC handlers in `core/controller/codebase-memory/` receive the controller and call `controller.codebaseMemory.<method>()` — identical to how `openMcpSettings.ts` accesses `controller.mcpHub`. `Controller.dispose()` calls `this.codebaseMemory.dispose()`.

## Webview UI (CodebaseMemorySection.tsx)

A new tab in `SettingsView.tsx`, following the existing section pattern (`GeneralSettingsSection.tsx`, `TerminalSettingsSection.tsx`, etc.). Uses the same `Section` / `SectionHeader` primitives and VS Code theming via CSS variables.

### Tab registration

Add to `SETTINGS_TABS` in `SettingsView.tsx`:

```typescript
{
  id: "codebase-memory",
  name: "Codebase Memory",
  tooltipText: "Codebase Memory — structural code intelligence",
  headerText: "Codebase Memory",
  icon: Network,  // lucide-react icon (graph/network feel)
}
```

And to `TAB_CONTENT_MAP`:
```typescript
"codebase-memory": CodebaseMemorySection,
```

`SettingsTabID` union gains `"codebase-memory"`.

### Section layout (single column, VS Code native feel)

```
┌─────────────────────────────────────────────────────┐
│ [icon] Codebase Memory                              │  ← SectionHeader
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─ Status Card ─────────────────────────────────┐   │
│ │ Binary:    ✓ installed (v0.7.0)               │   │
│ │ Project:   ✓ indexed — 12,453 nodes, 48,201   │   │
│ │            edges (indexed 2h ago)              │   │
│ │ MCP tools: ✓ registered for agent             │   │
│ │ Graph UI:  ○ not running                       │   │
│ └───────────────────────────────────────────────┘   │
│                                                     │
│ ┌─ Indexing ────────────────────────────────────┐   │
│ │ [ Index Current Project ]  [ Re-index ]        │   │
│ │                                                 │   │
│ │ ┌─ Progress Log (streaming) ─────────────────┐ │   │
│ │ │ > Parsing src/foo.ts...                     │ │   │
│ │ │ > Parsing src/bar.ts...                     │ │   │
│ │ │ > Built 12,453 nodes, 48,201 edges in 6.2s │ │   │
│ │ └─────────────────────────────────────────────┘ │   │
│ └───────────────────────────────────────────────┘   │
│                                                     │
│ ┌─ Graph ───────────────────────────────────────┐   │
│ │ [ View Graph in Browser ]                      │   │
│ │ Opens the 3D graph visualization at            │   │
│ │ localhost:9749 in your default browser.        │   │
│ └───────────────────────────────────────────────┘   │
│                                                     │
│ ┌─ Available MCP Tools (14) ────────────────────┐   │
│ │ These tools are now available to your agent:   │   │
│ │                                                 │   │
│ │ • index_repository — Index a repo into the graph│   │
│ │ • search_graph — Structured search by label...  │   │
│ │ • trace_path — BFS traversal of call chains     │   │
│ │ • get_architecture — Codebase overview          │   │
│ │ • get_code_snippet — Read source by qualified...│   │
│ │ • query_graph — Execute Cypher-like queries     │   │
│ │ • list_projects — List indexed projects         │   │
│ │ • delete_project — Remove a project             │   │
│ │ • index_status — Check indexing status          │   │
│ │ • detect_changes — Git diff → impact mapping    │   │
│ │ • get_graph_schema — Node/edge schema           │   │
│ │ • search_code — Graph-augmented grep            │   │
│ │ • manage_adr — Architecture Decision Records    │   │
│ │ • ingest_traces — Ingest runtime traces         │   │
│ └───────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Component structure

**`CodebaseMemorySection.tsx`** — top-level section, orchestrates state:

```typescript
export const CodebaseMemorySection = () => {
  const [status, setStatus] = useState<CodebaseMemoryStatus | undefined>()
  const [progressLines, setProgressLines] = useState<IndexProgressEvent[]>([])
  const [isIndexing, setIsIndexing] = useState(false)
  const [isOpeningGraph, setIsOpeningGraph] = useState(false)
  const { environment, workspaceRoots } = useExtensionState()  // workspaceRoots has the path(s)

  // On mount: fetch status
  useEffect(() => {
    CodebaseMemoryServiceClient.getStatus(EmptyRequest.create({}))
      .then(setStatus)
      .catch(console.error)
  }, [])

  // On unmount: stop graph server if we started it
  useEffect(() => () => {
    CodebaseMemoryServiceClient.stopGraphServer(EmptyRequest.create({}))
  }, [])

  const handleIndex = async () => {
    setIsIndexing(true)
    setProgressLines([])
    const repoPath = workspaceRoots[0]?.path // from extension state (WorkspaceRoot[].path)
    const stop = CodebaseMemoryServiceClient.indexProject(
      IndexProjectRequest.create({ repoPath }),
      {
        onData: (event) => setProgressLines((prev) => [...prev, event]),
        onEnd: () => {
          setIsIndexing(false)
          // refresh status
          CodebaseMemoryServiceClient.getStatus(EmptyRequest.create({})).then(setStatus)
        },
        onError: (err) => {
          console.error(err)
          setIsIndexing(false)
        },
      },
    )
  }

  const handleReindex = async () => { /* same, calls reindexProject */ }
  const handleViewGraph = async () => {
    setIsOpeningGraph(true)
    await CodebaseMemoryServiceClient.viewGraph(EmptyRequest.create({}))
    setIsOpeningGraph(false)
  }

  return (
    <div>
      <StatusCard status={status} />
      <IndexingCard
        onIndex={handleIndex} onReindex={handleReindex}
        isIndexing={isIndexing} progressLines={progressLines}
        canReindex={!!status?.is_indexed}
      />
      <GraphCard onViewGraph={handleViewGraph} isOpeningGraph={isOpeningGraph} running={status?.graph_server_running} />
      <ToolsCard />
    </div>
  )
}
```

**Four sub-components, each in its own file under `components/settings/sections/codebase-memory/`:**

1. **`StatusCard.tsx`** — renders the 4-line status grid (binary, project, MCP tools, graph UI). Uses VS Code `codicon` check/warning icons. Re-fetches status when prop changes. Shows "Download binary" hint if `binary_installed` is false.

2. **`IndexingCard.tsx`** — the "Index Current Project" / "Re-index" buttons (disabled while indexing). Below them, a scrollable `<pre>`-styled log showing `progressLines` with color coding (INFO gray, WARN yellow, ERROR red, DONE green). Auto-scrolls to bottom on new lines. Buttons use the existing `Button` component from `components/ui/`. A Cancel button appears while indexing is in flight.

3. **`GraphCard.tsx`** — "View Graph in Browser" button + descriptive text. Calls `handleViewGraph`. Button shows spinner while opening.

4. **`ToolsCard.tsx`** — renders the 14-tool list. Tool data comes from `listTools` RPC on mount; renders each as a row with tool name (bold) + description. Pure presentational, no interactivity. Static data but fetched from host to keep the source of truth in one place (`constants.ts`).

**Styling:** uses CSS variables already available in the webview (`var(--vscode-foreground)`, `var(--vscode-descriptionForeground)`, `var(--vscode-button-background)`, etc.) — same as `GeneralSettingsSection.tsx`. No new CSS files; Tailwind classes + inline styles where needed, matching neighboring sections.

**Workspace folder access:** the webview already has `workspaceRoots` (a `WorkspaceRoot[]` where each root has a `path: string`) in `ExtensionStateContext` — `IndexingCard` reads `workspaceRoots[0]?.path` to pass `repoPath` to `indexProject`. If no workspace folder is open (empty array), the Index button is disabled with a tooltip.

## Error Handling, Testing, and Edge Cases

### Error handling

**Binary download failures** — `BinaryManager.ensureBinary()` throws on network error or checksum mismatch. The facade catches this and emits an `IndexProgressEvent` with `level=ERROR` and a user-facing message ("Failed to download binary: <reason>"). The webview shows it in the progress log. The buttons re-enable so the user can retry. No partial state — a failed download leaves no binary on disk.

**Indexing process failures** — `IndexingService` handles three cases:
- Non-zero exit code: emits `ERROR` with the last stderr line, then the stream ends.
- Process crash / signal: emits `ERROR` with "Indexing process exited unexpectedly (signal SIGTERM)".
- Timeout: after 10 minutes with no stdout, kills the process and emits `ERROR` with "Indexing timed out — no output for 600s". The user can re-index.

**Graph server port conflict** — `GraphServerService.start()` checks if port 9749 is already responding before spawning. If it is, treats it as already running (could be a system-wide install the user started). If the port is in use but not responding as the graph UI, tries the next port (9750, 9751) and reports the actual URL. The `viewGraph` RPC returns the URL actually used via `ViewGraphResponse.url`.

**MCP registration race** — `McpRegistrationService.register()` is idempotent and called only after a successful index. If the settings file is locked by another process (CLI, another window), `updateMcpSettingsFile` already retries with a lock — we inherit that behavior. If it fails, the index still succeeded (graph is usable); MCP tools just won't be available. Status card shows `mcp_server_registered: false` and the user can re-index to retry registration.

**Workspace with no folder open** — `indexProject` RPC receives an empty `repo_path`. The host returns an `ERROR` event: "No workspace folder open — open a project folder first." The webview disables the Index button when `environment` has no workspace path.

### Testing strategy

**Unit tests (vitest, existing pattern):**

| Unit | What we test |
|------|-------------|
| `BinaryManager` | platform/arch → correct archive URL; checksum verification rejects tampered archive; `getInstalledVersion` parses `--version` output; idempotent `ensureBinary` (no re-download) |
| `IndexingService` | streams stdout lines as events; parses final JSON for node/edge counts; non-zero exit → ERROR; cancel kills child; timeout fires after no output |
| `GraphServerService` | start spawns process; port-already-running detection; stop kills process; double-start is a no-op |
| `McpRegistrationService` | register writes correct JSON entry; idempotent (no duplicate on re-register); unregister removes entry; isRegistered detects matching path |
| `CodebaseMemoryFacade` | indexProject calls ensureBinary → index → register in order; getStatus aggregates all four services; viewGraph starts server then returns URL |
| gRPC handlers | each handler calls the facade method and returns the correct proto type |

**Test infra:** existing `vitest.config.ts` and `__tests__/` colocated pattern. Mock `child_process.spawn` for `IndexingService`/`GraphServerService`. Mock `fs` for `BinaryManager`. Mock `updateMcpSettingsFile` for `McpRegistrationService`. The test pattern already exists in `services/mcp/__tests__/`.

**No integration tests against the real binary** — the binary is 15MB and platform-specific. Unit tests mock the process. A manual test checklist in the section's README covers end-to-end verification.

### Edge cases

1. **Binary deleted while extension running** — `getStatus` detects `binary_installed: false`. If graph server was running, it is now dead. Indexing shows "Binary missing — click Index to re-download." MCP registration entry becomes stale; we do not auto-remove it (the agent's McpHub will show a connection error in its own UI).

2. **Multiple windows, same workspace** — both windows share the binary in global storage. `indexProject` in window A writes the graph DB to `~/.cache/codebase-memory-mcp/` (binary-managed, not extension storage). Window B's `getStatus` calls `index_status` via CLI and sees the indexed state. Both can view the graph (same server, or second start is a no-op if port is taken).

3. **Extension deactivation mid-index** — `CodebaseMemoryFacade.dispose()` calls `indexingService.cancel()`, killing the child process. The partial graph DB is left as-is (the binary handles this safely — RAM-first pipeline means no partial writes). On next activation, `getStatus` shows the previous indexed state.

4. **User uninstalls the extension** — binary remains in global storage (VS Code cleans this on extension uninstall). MCP settings entry remains but points to a now-deleted binary. The existing MCP UI shows a connection error for that server, which the user can delete via the existing MCP management UI.

5. **Binary version mismatch / update available** — `getStatus` includes `binary_version`. If `isUpdateAvailable()` returns true, the StatusCard shows an "Update available" badge with a "Download update" button that calls `ensureBinary()` (which re-downloads). Does not auto-update — explicit user action.

6. **Large codebase (Linux kernel scale)** — indexing can take minutes. The progress log scrolls and shows elapsed time. The Cancel button (next to Index) calls the streaming request's stop function, killing the process. No UI freeze — all work is in the host process, webview just receives streamed events.

### Testing verification commands

Following the codebase's existing pattern:
```bash
# From apps/vscode
bun run check-types   # typecheck
bun run lint          # biome lint
bun test src/services/codebase-memory  # unit tests
```

## File Structure Summary

### Complete file map

**New files — extension host:**
```
apps/vscode/proto/cline/codebase_memory.proto                    # gRPC contract (6 RPCs)

apps/vscode/src/services/codebase-memory/
  constants.ts                    # 14-tool static list, GitHub URL, port 9749
  types.ts                        # Platform, DownloadProgress, etc.
  BinaryManager.ts                # download, verify, locate binary
  IndexingService.ts              # spawn CLI, stream progress
  GraphServerService.ts           # lifecycle for --ui=true process
  McpRegistrationService.ts       # write entry to MCP settings file
  CodebaseMemoryFacade.ts         # thin coordinator
  __tests__/
    BinaryManager.test.ts
    IndexingService.test.ts
    GraphServerService.test.ts
    McpRegistrationService.test.ts
    CodebaseMemoryFacade.test.ts

apps/vscode/src/core/controller/codebase-memory/
  getStatus.ts                    # unary handler
  indexProject.ts                 # streaming handler
  reindexProject.ts               # streaming handler
  viewGraph.ts                    # unary handler
  stopGraphServer.ts              # unary handler
  listTools.ts                    # unary handler
```

**New files — webview:**
```
apps/vscode/webview-ui/src/components/settings/sections/
  CodebaseMemorySection.tsx       # top-level section component

apps/vscode/webview-ui/src/components/settings/sections/codebase-memory/
  StatusCard.tsx                  # 4-line status grid
  IndexingCard.tsx                # index/reindex buttons + progress log
  GraphCard.tsx                   # view graph button
  ToolsCard.tsx                   # 14-tool reference list
```

**Modified files:**
```
apps/vscode/src/sdk/SdkController.ts
  # add: this.codebaseMemory = new CodebaseMemoryFacade(context, this.mcpHub)
  # add: dispose() calls this.codebaseMemory.dispose()

apps/vscode/webview-ui/src/components/settings/SettingsView.tsx
  # add "codebase-memory" tab to SETTINGS_TABS
  # add CodebaseMemorySection to TAB_CONTENT_MAP
  # add to SettingsTabID union
```

**Generated (by `bun run protos`):**
```
apps/vscode/src/shared/proto/cline/codebase_memory.ts      # proto TS types
apps/vscode/webview-ui/src/services/grpc-client.ts          # CodebaseMemoryServiceClient (auto-appended)
apps/vscode/src/generated/hosts/vscode/protobus-services.ts # service handler registration (auto-appended)
apps/vscode/src/generated/hosts/vscode/protobus-service-types.ts
apps/vscode/src/generated/hosts/standalone/protobus-server-setup.ts
```

### Dependencies (no new packages)

- `tar` — already in `package.json` overrides (`"tar": "^7.5.2"`), used for extracting the GitHub release archive
- `node:child_process`, `node:crypto`, `node:fs`, `node:os`, `node:path` — Node builtins
- `@modelcontextprotocol/sdk` — already a dependency (used by McpHub)
- `lucide-react` — already used in SettingsView for icons (`Network` icon for our tab)
- Existing `services/mcp/settingsLock.ts` `updateMcpSettingsFile` — reused for atomic writes
- Existing `components/ui/Button`, `components/common/ViewHeader` — reused in webview

## Global Constraints

1. **No new npm dependencies** — use only packages already in the workspace.
2. **TypeScript strict** — follow existing `tsconfig.json` paths (`@core/*`, `@generated/*`, `@services/*`, `@shared/*`).
3. **Proto lint** — new proto must pass `bun run proto-lint` (STANDARD rules, with the existing exceptions in `buf.yaml` — RPCs are camelCase, request messages need not end in `Request`).
4. **Biome lint** — all new files must pass `bun run lint` (biome, the repo's linter).
5. **Test framework** — vitest, colocated `__tests__/` pattern, mock child_process and fs.
6. **VS Code engine** — `^1.84.0` (from package.json); no APIs newer than that.
7. **Binary download URL** — `https://github.com/DeusData/codebase-memory-mcp/releases/latest` (from the GitHub README).
8. **Graph UI port** — 9749 (upstream default), with fallback to 9750, 9751.
9. **MCP settings entry key** — `"codebase-memory-mcp"` (matches upstream's `install` command convention).
10. **Binary storage path** — `${context.globalStorageUri}/codebase-memory-mcp/cbm`.

## Decomposition Check

This is a single focused subsystem: integrating one external tool into the extension's settings. It has one user-facing surface (the tab), one external dependency (the binary), and one integration point (MCP settings). It does not need to be broken into sub-projects — it is a single coherent feature that produces working, testable software (the tab appears, the button downloads and indexes, the agent gets the tools).
