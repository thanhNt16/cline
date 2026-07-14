# Document Index UI Integration Design

> **Vessel Indexer** — a Go-based document indexing + semantic search service exposed via MCP Streamable HTTP and REST.

## Goal

Add a "Document Index" settings tab to the Cline VSCode extension that lets users connect to a Vessel Indexer service, manage projects, upload documents, index/re-index documents and URLs, search indexed documents, and view available MCP tools — mirroring the existing "Codebase Index" (codebase-memory) UI pattern.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Webview UI                                │
│  Settings tab "Document Index"                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │Connection│ │ Projects │ │ Upload   │ │ Index    │       │
│  │  Card    │ │  Card    │ │  Card    │ │  Card    │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐ ┌──────────┐                                 │
│  │ Search   │ │ Tools    │                                 │
│  │  Card    │ │  Card    │                                 │
│  └──────────┘ └──────────┘                                 │
│         │ DocsIndexServiceClient (generated gRPC)           │
└─────────┼───────────────────────────────────────────────────┘
          │ postMessage → grpc-handler
┌─────────┼───────────────────────────────────────────────────┐
│         ▼  Extension Backend                                 │
│  Controller handlers (thin thunks)                           │
│         │                                                    │
│         ▼                                                    │
│  DocsIndexFacade                                             │
│  ├── VesselIndexerClient (HTTP: /mcp JSON-RPC, /upload)     │
│  ├── McpRegistrationService (writes mcp_settings.json)       │
│  └── constants (DOCS_INDEX_TOOLS, MCP_SERVER_KEY)            │
└──────────────────────────────────────────────────────────────┘
          │ HTTP
┌─────────┼───────────────────────────────────────────────────┐
│         ▼  Vessel Indexer (Docker, port 20130)               │
│  /mcp   → MCP Streamable HTTP (6 tools)                     │
│  /upload → Multipart file upload                             │
└──────────────────────────────────────────────────────────────┘
```

The Vessel Indexer is a Docker-based HTTP service. Cline connects to it at a configurable URL (default `http://localhost:20130`) — it does not manage the Docker container lifecycle. The `DocsIndexFacade` calls the Vessel Indexer's MCP tools via JSON-RPC POST to `/mcp` and file uploads via multipart POST to `/upload`. MCP registration writes a `streamableHttp` entry into `.cellockai/mcp_settings.json` so the agent gets the 6 search/index tools in chat.

## Vessel Indexer MCP Tools (6 tools, streamable-http transport)

| Tool | Parameters | Response |
|------|-----------|----------|
| `search_documents` | `project`, `query`, `top_k` (default 10) | Ranked results with text, score, hybrid_score, metadata |
| `index_project` | `project` | files_scanned, files_indexed, files_failed, chunks_added, elapsed_ms |
| `index_url` | `project`, `url`, `depth` (default 3), `max_pages` (default 50) | project, seed_url, pages_crawled, chunks_added |
| `list_projects` | (none) | projects array: name, mount_path, total_chunks, status |
| `project_stats` | `project` | total_chunks, files_indexed, by_format |
| `upload_document` | `project`, `filename`, `content`, `is_base64` | project, filename, path, chunks, status |

## REST Endpoint

### `POST /upload`

Multipart file upload. The facade reads a file from disk and POSTs it.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project` | string | yes | Project name |
| `file` | file | yes | Binary file (pdf, docx, pptx, xlsx, xls, md, txt, csv, html, htm) |

Response: `{ project, filename, path, size, status }`

## Proto/RPC Design

New file: `apps/vscode/proto/cline/docs_index.proto`

### Service: `DocsIndexService`

All RPCs are unary (the Vessel Indexer operations are synchronous — no streaming progress).

| RPC | Request | Response | Backend Action |
|-----|---------|----------|----------------|
| `ping` | `PingRequest` | `PingResponse` | Calls `list_projects` tool as health check |
| `listProjects` | `ListProjectsRequest` | `ListProjectsResponse` | Calls `list_projects` MCP tool |
| `projectStats` | `ProjectStatsRequest` | `ProjectStatsResponse` | Calls `project_stats` MCP tool |
| `indexProject` | `IndexProjectRequest` | `IndexProjectResponse` | Calls `index_project` MCP tool |
| `indexUrl` | `IndexUrlRequest` | `IndexUrlResponse` | Calls `index_url` MCP tool |
| `uploadFile` | `UploadFileRequest` | `UploadFileResponse` | Opens file picker dialog, reads file, POSTs multipart to `/upload` |
| `searchDocuments` | `SearchDocumentsRequest` | `SearchDocumentsResponse` | Calls `search_documents` MCP tool |
| `listTools` | `EmptyRequest` | `DocsIndexTools` | Returns static tool list from constants |
| `registerMcpServer` | `RegisterMcpRequest` | `Empty` | Writes streamableHttp entry to mcp_settings.json |
| `unregisterMcpServer` | `UnregisterMcpRequest` | `Empty` | Removes entry from mcp_settings.json |

### Message Definitions

```proto
syntax = "proto3";
package cline;
import "cline/common.proto";

// --- Connection ---

message PingRequest {
  string server_url = 1;
}

message PingResponse {
  bool connected = 1;
  string server_version = 2;
}

// --- Projects ---

message ListProjectsRequest {
  string server_url = 1;
}

message ProjectInfo {
  string name = 1;
  string mount_path = 2;
  int32 total_chunks = 3;
  string status = 4;
}

message ListProjectsResponse {
  repeated ProjectInfo projects = 1;
}

message ProjectStatsRequest {
  string server_url = 1;
  string project = 2;
}

message ProjectStatsResponse {
  string project = 1;
  int32 total_chunks = 2;
  int32 files_indexed = 3;
  map<string, int32> by_format = 4;
}

// --- Indexing ---

message IndexProjectRequest {
  string server_url = 1;
  string project = 2;
}

message IndexProjectResponse {
  int32 files_scanned = 1;
  int32 files_indexed = 2;
  int32 files_failed = 3;
  int32 chunks_added = 4;
  int32 elapsed_ms = 5;
}

message IndexUrlRequest {
  string server_url = 1;
  string project = 2;
  string url = 3;
  int32 depth = 4;
  int32 max_pages = 5;
}

message IndexUrlResponse {
  string project = 1;
  string seed_url = 2;
  int32 pages_crawled = 3;
  int32 chunks_added = 4;
}

// --- Upload ---

message UploadFileRequest {
  string server_url = 1;
  string project = 2;
}

message UploadFileResponse {
  string project = 1;
  string filename = 2;
  string path = 3;
  int64 size = 4;
  string status = 5;
}

// --- Search ---

message SearchDocumentsRequest {
  string server_url = 1;
  string project = 2;
  string query = 3;
  int32 top_k = 4;
}

message SearchResult {
  string text = 1;
  double score = 2;
  double hybrid_score = 3;
  string metadata = 4; // JSON string
}

message SearchDocumentsResponse {
  string project = 1;
  string query = 2;
  repeated SearchResult results = 3;
}

// --- Tools ---

message DocsIndexTool {
  string name = 1;
  string description = 2;
}

message DocsIndexTools {
  repeated DocsIndexTool tools = 1;
}

// --- MCP Registration ---

message RegisterMcpRequest {
  string server_url = 1;
}

message UnregisterMcpRequest {}
```

## Backend Design

### File Structure

```
apps/vscode/src/services/docs-index/
├── DocsIndexFacade.ts          # Main facade — orchestrates all operations
├── VesselIndexerClient.ts      # Low-level HTTP client (JSON-RPC to /mcp, multipart to /upload)
├── McpRegistrationService.ts   # Writes/removes streamableHttp entry in mcp_settings.json
└── constants.ts                # MCP_SERVER_KEY, DOCS_INDEX_TOOLS, DEFAULT_SERVER_URL, toProtoTools()
```

### `VesselIndexerClient`

```typescript
class VesselIndexerClient {
  constructor(private serverUrl: string) {}

  // Calls an MCP tool via JSON-RPC 2.0 POST to /mcp
  // Sends: { jsonrpc: "2.0", method: "tools/call", params: { name, arguments }, id: 1 }
  // Parses JSON response or SSE stream (text/event-stream)
  async callTool(toolName: string, args: Record<string, any>): Promise<any>

  // Uploads a file via multipart POST to /upload
  // Reads file from disk, constructs multipart/form-data with project + file fields
  async uploadFile(project: string, filePath: string): Promise<{
    project: string; filename: string; path: string; size: number; status: string
  }>
}
```

### `DocsIndexFacade`

```typescript
class DocsIndexFacade {
  constructor(
    private context: vscode.ExtensionContext,
    private mcpHub: McpHub
  ) {}

  async ping(serverUrl: string): Promise<PingResponse>
  async listProjects(serverUrl: string): Promise<ListProjectsResponse>
  async projectStats(serverUrl: string, project: string): Promise<ProjectStatsResponse>
  async indexProject(serverUrl: string, project: string): Promise<IndexProjectResponse>
  async indexUrl(serverUrl: string, project: string, url: string, depth: number, maxPages: number): Promise<IndexUrlResponse>
  async uploadFile(serverUrl: string, project: string): Promise<UploadFileResponse>
  async searchDocuments(serverUrl: string, project: string, query: string, topK: number): Promise<SearchDocumentsResponse>
  async registerMcpServer(serverUrl: string): Promise<void>
  async unregisterMcpServer(): Promise<void>
}
```

Each method creates a `VesselIndexerClient` with the given `serverUrl`, calls the appropriate MCP tool via JSON-RPC, and maps the response to the proto message type.

The `uploadFile` method is special: it first opens `vscode.window.showOpenDialog` to let the user pick a file, then passes the resulting file path to `VesselIndexerClient.uploadFile(project, filePath)` which reads the file and POSTs it to `/upload`. If the user cancels the dialog, it returns an `UploadFileResponse` with `status: "cancelled"`.

### `McpRegistrationService`

Uses `updateMcpSettingsFile` from `services/mcp/settingsLock.ts` (same pattern as codebase-memory's `McpRegistrationService`). Writes:

```json
{
  "vessel-indexer": {
    "type": "streamableHttp",
    "url": "http://localhost:20130/mcp",
    "disabled": false,
    "autoApprove": []
  }
}
```

The `url` in the MCP settings is `{serverUrl}/mcp` (the MCP endpoint, not the base URL). The `autoApprove` array is empty by default — the user can auto-approve tools through the generic MCP configuration view.

### `constants.ts`

```typescript
export const MCP_SERVER_KEY = "vessel-indexer"
export const DEFAULT_SERVER_URL = "http://localhost:20130"

export const DOCS_INDEX_TOOLS = [
  { name: "search_documents", description: "Hybrid BM25 + semantic cosine search across a project's indexed documents" },
  { name: "index_project", description: "Re-scan a project's mount folder and index new/changed files" },
  { name: "index_url", description: "Crawl a website (same-domain, BFS) and index page text into a project" },
  { name: "list_projects", description: "List all configured projects with index status" },
  { name: "project_stats", description: "Detailed statistics for a project's index" },
  { name: "upload_document", description: "Upload text content and index immediately (base64 for binary)" },
]
```

### Controller Wiring (in `SdkController.ts`)

- Add field: `docsIndex: DocsIndexFacade`
- Constructor: `this.docsIndex = new DocsIndexFacade(this.context, this.mcpHub)`
- Dispose: `this.docsIndex?.dispose?.()` (if needed)

### Controller Handlers (in `apps/vscode/src/core/controller/docsIndex/`)

10 thin handler files (one per RPC), each following the codebase-memory handler pattern:

```typescript
// Example: ping.ts
export async function ping(controller: Controller, request: PingRequest): Promise<PingResponse> {
  try {
    return await controller.docsIndex.ping(request.serverUrl)
  } catch (error) {
    Logger.error("Failed to ping docs-index:", error)
    return PingResponse.create({ connected: false, serverVersion: "" })
  }
}
```

Handler files: `ping.ts`, `listProjects.ts`, `projectStats.ts`, `indexProject.ts`, `indexUrl.ts`, `uploadFile.ts`, `searchDocuments.ts`, `listTools.ts`, `registerMcpServer.ts`, `unregisterMcpServer.ts`.

## UI Design

### Settings Tab Registration

In `webview-ui/src/components/settings/SettingsView.tsx`:
- Add `"docs-index"` to `SettingsTabID` type
- Add tab definition to `SETTINGS_TABS`: `{ id: "docs-index", name: "Document Index", tooltipText: "Document Indexing & Search", headerText: "Document Index", icon: FileText }`
- Add to `TAB_CONTENT_MAP`: `"docs-index": DocsIndexSection`

### Component Structure

```
webview-ui/src/components/settings/sections/
├── DocsIndexSection.tsx                  # Parent container, shared state
└── docs-index/
    ├── connection/ConnectionCard.tsx     # URL input, connect/disconnect, status
    ├── projects/ProjectsCard.tsx         # Project dropdown, stats display
    ├── upload/UploadCard.tsx             # File picker, upload result
    ├── indexing/IndexCard.tsx            # Index project + index URL form
    ├── search/SearchCard.tsx             # Search box, results list
    └── tools/ToolsCard.tsx              # Tool list with descriptions
```

### Parent State (`DocsIndexSection.tsx`)

```typescript
const [serverUrl, setServerUrl] = useState("http://localhost:20130")
const [connected, setConnected] = useState(false)
const [connecting, setConnecting] = useState(false)
const [projects, setProjects] = useState<ProjectInfo[]>([])
const [selectedProject, setSelectedProject] = useState<string>("")
const [tools, setTools] = useState<DocsIndexTool[]>([])
```

Child cards receive props from parent. No `ExtensionStateContext` changes needed — self-contained local state pattern (same as codebase-memory).

### Card Details

**1. ConnectionCard**
- URL input field (default `http://localhost:20130`)
- "Connect" button → calls `DocsIndexServiceClient.ping({ serverUrl })`
- On success: sets `connected = true`, auto-calls `registerMcpServer({ serverUrl })`, `listProjects({ serverUrl })`, `listTools(EmptyRequest)`
- On failure: shows error message
- Status indicator: green dot + "Connected" / red dot + "Disconnected"
- "Disconnect" button → calls `unregisterMcpServer({})`, sets `connected = false`

**2. ProjectsCard**
- Dropdown populated from `projects` state
- On project select: calls `projectStats({ serverUrl, project })` to show stats
- Shows: total chunks, files indexed, format breakdown (pdf: 278, txt: 1, etc.)
- "Refresh" button → re-fetches `listProjects`
- Disabled when `!connected`

**3. UploadCard**
- "Upload File" button → calls `uploadFile({ serverUrl, project })`
  - The backend handler opens `vscode.window.showOpenDialog` to pick a file, reads it, and POSTs to `/upload`
  - If user cancels the file dialog, shows "Upload cancelled"
- Shows upload result: filename, size (human-readable), status
- Multiple uploads: user can click "Upload File" multiple times; each upload shows its result
- Disabled when `!connected || !selectedProject`

**4. IndexCard**
- "Index Project" button → calls `indexProject({ serverUrl, project })`
  - Loading spinner during operation
  - Result: "Scanned X files, indexed Y new, Z chunks added (N.Ns)"
- URL Indexing sub-form:
  - URL input (required)
  - Depth input (default 3, number)
  - Max Pages input (default 50, number)
  - "Index URL" button → calls `indexUrl({ serverUrl, project, url, depth, maxPages })`
  - Loading spinner during operation
  - Result: "Crawled X pages, Y chunks added"
- Disabled when `!connected || !selectedProject`

**5. SearchCard**
- Search input box
- Top-K selector (default 10, range 1-50, step 1)
- "Search" button → calls `searchDocuments({ serverUrl, project, query, topK })`
- Results: scrollable list, each result shows:
  - Text snippet (truncated to ~200 chars with ellipsis)
  - Score + hybrid score (formatted as percentages)
  - Metadata badge (file type, page number)
- Empty state: "Search for documents to see results"
- Disabled when `!connected || !selectedProject`

**6. ToolsCard**
- Calls `listTools(EmptyRequest)` on mount (returns static tool list)
- Shows "Available MCP Tools (6)" header
- Each tool: name (monospace) + description
- Hint: "Tools are available to the agent in chat after connecting"

## File Upload Flow

The file upload requires a VSCode file picker dialog, which can only be opened from the extension backend (not the webview). The flow:

1. User clicks "Upload File" in the webview
2. Webview calls `DocsIndexServiceClient.uploadFile({ serverUrl, project })` (no file path — the backend picks the file)
3. Backend handler opens `vscode.window.showOpenDialog` to let the user pick a file
4. If user cancels the dialog, return `UploadFileResponse` with empty `filename` and `status: "cancelled"`
5. Backend reads the file from disk, constructs multipart POST to `{serverUrl}/upload`
6. Returns `UploadFileResponse` to webview

## Global Constraints

- Do not change internal identifiers (`ClineProvider`, proto services, `@cline/*` imports, storage keys)
- Proto regen (`npm run protos`) generates 100+ files — this is expected; the generated files are committed
- `bun:test` imports required for unit tests (not mocha) — `scripts/run-bun-unit-tests.ts` filters on `from "bun:test"` pattern
- Base directory for all commands: `apps/vscode/`
- Typecheck: `npm run check-types` | Unit tests: `npm run test:unit` | Full compile: `npm run compile` | Proto: `npm run protos`
- `SdkController` constructor is NOT async — use synchronous initialization
- Follow existing biome formatting rules (tabs, double quotes for biome, single quotes for TypeScript imports per existing convention)
- The Vessel Indexer URL is stored in the webview's local component state, not in VSCode settings or `ExtensionStateContext` — this matches the codebase-memory pattern where state is self-contained
- MCP server key in settings: `"vessel-indexer"` (lowercase, hyphenated)
- The MCP settings entry uses `"type": "streamableHttp"` (not `"sse"` or `"http"`)

## Testing Strategy

### Unit Tests (bun:test)

- `VesselIndexerClient.test.ts`: Mock HTTP calls (use `fetch` mock), verify JSON-RPC payload format, verify multipart upload construction
- `DocsIndexFacade.test.ts`: Mock `VesselIndexerClient`, verify response mapping to proto types
- `McpRegistrationService.test.ts`: Mock `updateMcpSettingsFile`, verify write/remove of `vessel-indexer` entry

### Manual Smoke Test

1. Start Vessel Indexer Docker container on port 20130
2. Open Cline settings → "Document Index" tab
3. Enter URL, click Connect → status shows "Connected"
4. Verify `.cellockai/mcp_settings.json` contains `vessel-indexer` entry
5. Select a project from dropdown → stats appear
6. Upload a PDF file → result shows filename, size, "indexed"
7. Click "Index Project" → result shows files scanned, chunks added
8. Enter a URL, click "Index URL" → result shows pages crawled, chunks added
9. Search for a term → results appear with scores and metadata
10. Tools card shows 6 tools with descriptions
11. In chat, ask the agent to search documents → agent uses `search_documents` MCP tool
