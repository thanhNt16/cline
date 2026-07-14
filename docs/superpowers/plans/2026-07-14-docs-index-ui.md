# Document Index UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Document Index" settings tab to the Cline VSCode extension that connects to a Vessel Indexer HTTP service, manages projects, uploads documents, indexes/re-indexes, searches, and views available MCP tools.

**Architecture:** New `DocsIndexService` proto with 10 unary RPCs → controller handlers → `DocsIndexFacade` (caches `VesselIndexerClient` per URL) → HTTP calls to Vessel Indexer (`/mcp` JSON-RPC via MCP SDK, `/upload` multipart via fetch). Webview uses generated `DocsIndexServiceClient`. Settings tab with 6 cards (Connection, Projects, Upload, Index, Search, Tools).

**Tech Stack:** TypeScript, protobuf, React, MCP SDK (`@modelcontextprotocol/sdk`), VSCode Extension API, bun:test

## Global Constraints

- Do not change internal identifiers (`ClineProvider`, proto services, `@cline/*` imports, storage keys)
- Proto regen (`npm run protos`) generates 100+ files — this is expected; generated files are committed
- `bun:test` imports required for unit tests (not mocha) — `scripts/run-bun-unit-tests.ts` filters on `from "bun:test"` pattern
- Base directory for all commands: `apps/vscode/`
- Typecheck: `npm run check-types` | Unit tests: `npm run test:unit` | Full compile: `npm run compile` | Proto: `npm run protos`
- `SdkController` constructor is NOT async — use synchronous initialization
- Follow existing biome formatting (tabs, double quotes for biome)
- The Vessel Indexer URL is stored in webview local component state, not in `ExtensionStateContext`
- MCP server key in settings: `"vessel-indexer"` (lowercase, hyphenated)
- MCP settings entry uses `"type": "streamableHttp"`
- The webview-ui uses `@shared/` alias for `../src/shared/` (NOT `@/shared/`)
- The extension backend uses `@shared/` alias for `src/shared/`
- The extension backend uses `@services/` alias for `src/services/`
- The extension backend uses `@core/` alias for `src/core/`
- The extension backend uses `@/` alias for `src/`
- UI cards use inline styles with CSS variables (same pattern as codebase-memory cards), NOT Tailwind classes

---

## File Structure

### Proto
- Create: `apps/vscode/proto/cline/docs_index.proto` — service + message definitions

### Generated (by `npm run protos`)
- Modified: `apps/vscode/webview-ui/src/services/grpc-client.ts` — adds `DocsIndexServiceClient`
- Modified: `apps/vscode/src/generated/hosts/vscode/protobus-services.ts` — adds handler registration
- Modified: `apps/vscode/src/generated/hosts/vscode/protobus-service-types.ts` — adds type definitions
- Created: `apps/vscode/src/shared/proto/cline/docs_index.ts` — generated proto types (committed)

### Backend Services
- Create: `apps/vscode/src/services/docs-index/constants.ts` — tool list, MCP key, defaults
- Create: `apps/vscode/src/services/docs-index/VesselIndexerClient.ts` — MCP SDK client + multipart upload
- Create: `apps/vscode/src/services/docs-index/McpRegistrationService.ts` — writes/removes streamableHttp entry
- Create: `apps/vscode/src/services/docs-index/DocsIndexFacade.ts` — main facade

### Controller Handlers
- Create: `apps/vscode/src/core/controller/docsIndex/ping.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/listProjects.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/projectStats.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/indexDocsProject.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/indexUrl.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/uploadFile.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/searchDocuments.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/listDocsIndexTools.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/registerMcpServer.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/unregisterMcpServer.ts`

### Controller Wiring
- Modify: `apps/vscode/src/sdk/SdkController.ts` — add `docsIndex` field, construct, dispose

### Webview UI
- Create: `apps/vscode/webview-ui/src/components/settings/sections/DocsIndexSection.tsx` — parent container
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/ConnectionCard.tsx`
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/ProjectsCard.tsx`
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/UploadCard.tsx`
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/IndexCard.tsx`
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/SearchCard.tsx`
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/ToolsCard.tsx`
- Modify: `apps/vscode/webview-ui/src/components/settings/SettingsView.tsx` — add "docs-index" tab

### Tests
- Create: `apps/vscode/src/services/docs-index/__tests__/VesselIndexerClient.test.ts`
- Create: `apps/vscode/src/services/docs-index/__tests__/DocsIndexFacade.test.ts`
- Create: `apps/vscode/src/services/docs-index/__tests__/McpRegistrationService.test.ts`

---

### Task 1: Proto Definition + Code Generation

**Files:**
- Create: `apps/vscode/proto/cline/docs_index.proto`
- Modified (generated): `apps/vscode/webview-ui/src/services/grpc-client.ts`
- Modified (generated): `apps/vscode/src/generated/hosts/vscode/protobus-services.ts`
- Modified (generated): `apps/vscode/src/generated/hosts/vscode/protobus-service-types.ts`
- Created (generated): `apps/vscode/src/shared/proto/cline/docs_index.ts`

**Interfaces:**
- Produces: `DocsIndexServiceClient` class in grpc-client.ts with 10 static methods (all unary):
  `ping`, `listProjects`, `projectStats`, `indexDocsProject`, `indexUrl`, `uploadFile`, `searchDocuments`, `listDocsIndexTools`, `registerMcpServer`, `unregisterMcpServer`
- Produces: Proto types in `@shared/proto/cline/docs_index`: `PingRequest`, `PingResponse`, `ListProjectsRequest`, `ProjectInfo`, `ListProjectsResponse`, `ProjectStatsRequest`, `ProjectStatsResponse`, `DocsIndexProjectRequest`, `DocsIndexProjectResponse`, `IndexUrlRequest`, `IndexUrlResponse`, `UploadFileRequest`, `UploadFileResponse`, `SearchDocumentsRequest`, `SearchResult`, `SearchDocumentsResponse`, `DocsIndexTool`, `DocsIndexTools`, `RegisterMcpRequest`, `UnregisterMcpRequest`
- Produces: Handler registration in `protobus-services.ts` for `"cline.DocsIndexService"`

- [ ] **Step 1: Create the proto file**

Create `apps/vscode/proto/cline/docs_index.proto`:

```proto
syntax = "proto3";

package cline;

import "cline/common.proto";

option go_package = "github.com/cline/grpc-go/cline";
option java_multiple_files = true;
option java_package = "bot.cline.proto";

service DocsIndexService {
  rpc ping(PingRequest) returns (PingResponse);
  rpc listProjects(ListProjectsRequest) returns (ListProjectsResponse);
  rpc projectStats(ProjectStatsRequest) returns (ProjectStatsResponse);
  rpc indexDocsProject(DocsIndexProjectRequest) returns (DocsIndexProjectResponse);
  rpc indexUrl(IndexUrlRequest) returns (IndexUrlResponse);
  rpc uploadFile(UploadFileRequest) returns (UploadFileResponse);
  rpc searchDocuments(SearchDocumentsRequest) returns (SearchDocumentsResponse);
  rpc listDocsIndexTools(EmptyRequest) returns (DocsIndexTools);
  rpc registerMcpServer(RegisterMcpRequest) returns (Empty);
  rpc unregisterMcpServer(UnregisterMcpRequest) returns (Empty);
}

message PingRequest {
  string server_url = 1;
}

message PingResponse {
  bool connected = 1;
  string server_version = 2;
}

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

message DocsIndexProjectRequest {
  string server_url = 1;
  string project = 2;
}

message DocsIndexProjectResponse {
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
  string metadata = 4;
}

message SearchDocumentsResponse {
  string project = 1;
  string query = 2;
  repeated SearchResult results = 3;
}

message DocsIndexTool {
  string name = 1;
  string description = 2;
}

message DocsIndexTools {
  repeated DocsIndexTool tools = 1;
}

message RegisterMcpRequest {
  string server_url = 1;
}

message UnregisterMcpRequest {}
```

- [ ] **Step 2: Run proto generation**

Run: `npm run protos`
Expected: Output mentioning "Processing 25 proto files" (was 24, now +1 for docs_index.proto). Generated files listed:
- `grpc-client.ts`
- `protobus-service-types.ts`
- `protobus-services.ts`
- `protobus-server-setup.ts`

- [ ] **Step 3: Verify generated files contain DocsIndexService**

Run: `grep -n "DocsIndexService" src/generated/hosts/vscode/protobus-services.ts`
Expected: Lines showing `DocsIndexServiceHandlers` definition and `"cline.DocsIndexService"` in `serviceHandlers` map.

Run: `grep -n "DocsIndexServiceClient" webview-ui/src/services/grpc-client.ts`
Expected: Lines showing `class DocsIndexServiceClient extends ProtoBusClient` with 10 static methods.

- [ ] **Step 4: Commit**

```bash
git add apps/vscode/proto/cline/docs_index.proto apps/vscode/src/shared/proto/cline/docs_index.ts apps/vscode/src/generated/ apps/vscode/webview-ui/src/services/grpc-client.ts
git commit -m "feat: add DocsIndexService proto and generated code"
```

---

### Task 2: Backend Constants + VesselIndexerClient

**Files:**
- Create: `apps/vscode/src/services/docs-index/constants.ts`
- Create: `apps/vscode/src/services/docs-index/VesselIndexerClient.ts`
- Test: `apps/vscode/src/services/docs-index/__tests__/VesselIndexerClient.test.ts`

**Interfaces:**
- Consumes: MCP SDK `Client` from `@modelcontextprotocol/sdk/client/index.js`, `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js`, `CallToolResultSchema` from `@modelcontextprotocol/sdk/types.js`
- Produces: `MCP_SERVER_KEY = "vessel-indexer"`, `DEFAULT_SERVER_URL = "http://localhost:20130"`, `DOCS_INDEX_TOOLS` array, `toProtoTools()` function
- Produces: `VesselIndexerClient` class with `connect()`, `callTool(toolName, args)`, `uploadFile(project, filePath)`, `close()` methods

- [ ] **Step 1: Create constants.ts**

Create `apps/vscode/src/services/docs-index/constants.ts`:

```typescript
import type { DocsIndexTool } from "@shared/proto/cline/docs_index"

export const MCP_SERVER_KEY = "vessel-indexer"

export const DEFAULT_SERVER_URL = "http://localhost:20130"

export const DOCS_INDEX_TOOLS: ReadonlyArray<{ name: string; description: string }> = [
	{ name: "search_documents", description: "Hybrid BM25 + semantic cosine search across a project's indexed documents" },
	{ name: "index_project", description: "Re-scan a project's mount folder and index new/changed files" },
	{ name: "index_url", description: "Crawl a website (same-domain, BFS) and index page text into a project" },
	{ name: "list_projects", description: "List all configured projects with index status" },
	{ name: "project_stats", description: "Detailed statistics for a project's index" },
	{ name: "upload_document", description: "Upload text content and index immediately (base64 for binary)" },
]

export function toProtoTools(): DocsIndexTool[] {
	return DOCS_INDEX_TOOLS.map((t) => ({ name: t.name, description: t.description }))
}
```

- [ ] **Step 2: Create VesselIndexerClient.ts**

Create `apps/vscode/src/services/docs-index/VesselIndexerClient.ts`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { Logger } from "@/shared/services/Logger"

export interface UploadResult {
	project: string
	filename: string
	path: string
	size: number
	status: string
}

export class VesselIndexerClient {
	private client: Client | null = null

	constructor(private readonly serverUrl: string) {}

	async connect(): Promise<void> {
		if (this.client) return
		const url = new URL(`${this.serverUrl}/mcp`)
		const transport = new StreamableHTTPClientTransport(url)
		this.client = new Client({ name: "cline-docs-index", version: "1.0.0" }, { capabilities: {} })
		await this.client.connect(transport)
	}

	async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
		if (!this.client) {
			await this.connect()
		}
		const result = await this.client!.request(
			{
				method: "tools/call",
				params: { name: toolName, arguments: args },
			},
			CallToolResultSchema,
		)
		const textContent = result.content?.find((c: any) => c.type === "text")
		if (!textContent?.text) {
			throw new Error(`Tool ${toolName} returned no text content`)
		}
		try {
			return JSON.parse(textContent.text)
		} catch {
			return textContent.text
		}
	}

	async uploadFile(project: string, filePath: string): Promise<UploadResult> {
		const fileBuffer = await fs.readFile(filePath)
		const filename = path.basename(filePath)
		const formData = new FormData()
		formData.append("project", project)
		formData.append("file", new Blob([fileBuffer]), filename)

		const response = await fetch(`${this.serverUrl}/upload`, {
			method: "POST",
			body: formData,
		})

		if (!response.ok) {
			throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
		}

		return (await response.json()) as UploadResult
	}

	async close(): Promise<void> {
		if (this.client) {
			try {
				await this.client.close()
			} catch (err) {
				Logger.error("VesselIndexerClient close error:", err)
			}
			this.client = null
		}
	}
}
```

- [ ] **Step 3: Write failing test for VesselIndexerClient**

Create `apps/vscode/src/services/docs-index/__tests__/VesselIndexerClient.test.ts`:

```typescript
import { describe, expect, mock, test } from "bun:test"

// Mock the MCP SDK modules before importing the class
mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: class MockClient {
		connect = mock(async () => {})
		request = mock(async (req: any) => ({
			content: [{ type: "text", text: JSON.stringify({ projects: [{ name: "test", mount_path: "/data", total_chunks: 5, status: "indexed" }] }) }],
		}))
		close = mock(async () => {})
	},
}))

mock.module("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport: class MockTransport {},
}))

mock.module("@modelcontextprotocol/sdk/types.js", () => ({
	CallToolResultSchema: {},
}))

const { VesselIndexerClient } = await import("../VesselIndexerClient")

describe("VesselIndexerClient", () => {
	test("callTool parses JSON text content from MCP response", async () => {
		const client = new VesselIndexerClient("http://localhost:20130")
		await client.connect()
		const result = await client.callTool("list_projects", {})
		expect(result.projects).toBeDefined()
		expect(result.projects[0].name).toBe("test")
		await client.close()
	})

	test("callTool returns raw text if not JSON", async () => {
		// Re-mock with non-JSON response
		mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
			Client: class MockClient2 {
				connect = mock(async () => {})
				request = mock(async () => ({
					content: [{ type: "text", text: "plain text response" }],
				}))
				close = mock(async () => {})
			},
		}))
		const { VesselIndexerClient: Client2 } = await import("../VesselIndexerClient")
		const client = new Client2("http://localhost:20130")
		await client.connect()
		const result = await client.callTool("some_tool", {})
		expect(result).toBe("plain text response")
		await client.close()
	})
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx bun test src/services/docs-index/__tests__/VesselIndexerClient.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/vscode/src/services/docs-index/constants.ts apps/vscode/src/services/docs-index/VesselIndexerClient.ts apps/vscode/src/services/docs-index/__tests__/VesselIndexerClient.test.ts
git commit -m "feat: add VesselIndexerClient and constants for docs-index service"
```

---

### Task 3: McpRegistrationService + DocsIndexFacade

**Files:**
- Create: `apps/vscode/src/services/docs-index/McpRegistrationService.ts`
- Create: `apps/vscode/src/services/docs-index/DocsIndexFacade.ts`
- Test: `apps/vscode/src/services/docs-index/__tests__/DocsIndexFacade.test.ts`
- Test: `apps/vscode/src/services/docs-index/__tests__/McpRegistrationService.test.ts`

**Interfaces:**
- Consumes: `McpHub` from `@services/mcp/McpHub` (for `getMcpSettingsFilePath()`), `updateMcpSettingsFile` from `@services/mcp/settingsLock`, `VesselIndexerClient` from Task 2, `toProtoTools` from Task 2
- Consumes: Proto types from `@shared/proto/cline/docs_index`
- Produces: `McpRegistrationService` class with `register(serverUrl)`, `unregister()`, `isRegistered(serverUrl)` methods
- Produces: `DocsIndexFacade` class with `ping`, `listProjects`, `projectStats`, `indexDocsProject`, `indexUrl`, `uploadFile`, `searchDocuments`, `listDocsIndexTools`, `registerMcpServer`, `unregisterMcpServer`, `dispose` methods

- [ ] **Step 1: Create McpRegistrationService.ts**

Create `apps/vscode/src/services/docs-index/McpRegistrationService.ts`:

```typescript
import type { McpHub } from "@services/mcp/McpHub"
import { updateMcpSettingsFile } from "@services/mcp/settingsLock"
import { Logger } from "@/shared/services/Logger"
import { MCP_SERVER_KEY } from "./constants"

export class McpRegistrationService {
	constructor(private readonly mcpHub: McpHub) {}

	async isRegistered(serverUrl: string): Promise<boolean> {
		const settingsPath = await this.mcpHub.getMcpSettingsFilePath()
		const fs = await import("node:fs/promises")
		try {
			const content = await fs.readFile(settingsPath, "utf8")
			const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> }
			const entry = parsed.mcpServers?.[MCP_SERVER_KEY] as { url?: string; type?: string } | undefined
			const expectedUrl = `${serverUrl}/mcp`
			return !!entry && entry.url === expectedUrl && entry.type === "streamableHttp"
		} catch {
			return false
		}
	}

	async register(serverUrl: string): Promise<void> {
		const settingsPath = await this.mcpHub.getMcpSettingsFilePath()
		const mcpUrl = `${serverUrl}/mcp`
		Logger.log(`[DocsIndex] register: writing to ${settingsPath} url=${mcpUrl}`)
		await updateMcpSettingsFile(settingsPath, (settings) => {
			if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
				settings.mcpServers = {}
			}
			const servers = settings.mcpServers as Record<string, unknown>
			const existing = servers[MCP_SERVER_KEY] as { autoApprove?: string[] } | undefined
			servers[MCP_SERVER_KEY] = {
				type: "streamableHttp",
				url: mcpUrl,
				disabled: false,
				autoApprove: existing?.autoApprove ?? [],
			}
		})
	}

	async unregister(): Promise<void> {
		const settingsPath = await this.mcpHub.getMcpSettingsFilePath()
		Logger.log(`[DocsIndex] unregister: removing from ${settingsPath}`)
		await updateMcpSettingsFile(settingsPath, (settings) => {
			if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
				return
			}
			const servers = settings.mcpServers as Record<string, unknown>
			delete servers[MCP_SERVER_KEY]
		})
	}
}
```

- [ ] **Step 2: Create DocsIndexFacade.ts**

Create `apps/vscode/src/services/docs-index/DocsIndexFacade.ts`:

```typescript
import type { McpHub } from "@services/mcp/McpHub"
import { Logger } from "@/shared/services/Logger"
import {
	DocsIndexTools,
	DocsIndexProjectResponse,
	IndexUrlResponse,
	ListProjectsResponse,
	PingResponse,
	ProjectInfo,
	ProjectStatsResponse,
	SearchDocumentsResponse,
	SearchResult,
	UploadFileResponse,
} from "@shared/proto/cline/docs_index"
import * as vscode from "vscode"
import { toProtoTools, DOCS_INDEX_TOOLS } from "./constants"
import { McpRegistrationService } from "./McpRegistrationService"
import { VesselIndexerClient } from "./VesselIndexerClient"

export class DocsIndexFacade {
	private mcpRegistration: McpRegistrationService
	private clients: Map<string, VesselIndexerClient> = new Map()

	constructor(mcpHub: McpHub) {
		this.mcpRegistration = new McpRegistrationService(mcpHub)
	}

	private async getClient(serverUrl: string): Promise<VesselIndexerClient> {
		let client = this.clients.get(serverUrl)
		if (!client) {
			client = new VesselIndexerClient(serverUrl)
			await client.connect()
			this.clients.set(serverUrl, client)
		}
		return client
	}

	private async invalidateClient(serverUrl: string): Promise<void> {
		const client = this.clients.get(serverUrl)
		if (client) {
			await client.close()
			this.clients.delete(serverUrl)
		}
	}

	async ping(serverUrl: string): Promise<PingResponse> {
		try {
			const client = await this.getClient(serverUrl)
			await client.callTool("list_projects", {})
			return PingResponse.create({ connected: true, serverVersion: "" })
		} catch (err) {
			Logger.error("[DocsIndex] ping failed:", err)
			await this.invalidateClient(serverUrl)
			return PingResponse.create({ connected: false, serverVersion: "" })
		}
	}

	async listProjects(serverUrl: string): Promise<ListProjectsResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.callTool("list_projects", {})
			const projects = (result.projects || []).map((p: any) =>
				ProjectInfo.create({
					name: p.name || "",
					mountPath: p.mount_path || "",
					totalChunks: p.total_chunks || 0,
					status: p.status || "",
				}),
			)
			return ListProjectsResponse.create({ projects })
		} catch (err) {
			Logger.error("[DocsIndex] listProjects failed:", err)
			await this.invalidateClient(serverUrl)
			return ListProjectsResponse.create({ projects: [] })
		}
	}

	async projectStats(serverUrl: string, project: string): Promise<ProjectStatsResponse> {
		const client = await this.getClient(serverUrl)
		const result = await client.callTool("project_stats", { project })
		const byFormat: Record<string, number> = {}
		if (result.by_format) {
			for (const [key, val] of Object.entries(result.by_format)) {
				byFormat[key] = val as number
			}
		}
		return ProjectStatsResponse.create({
			project: result.project || project,
			totalChunks: result.total_chunks || 0,
			filesIndexed: result.files_indexed || 0,
			byFormat,
		})
	}

	async indexDocsProject(serverUrl: string, project: string): Promise<DocsIndexProjectResponse> {
		const client = await this.getClient(serverUrl)
		const result = await client.callTool("index_project", { project })
		return DocsIndexProjectResponse.create({
			filesScanned: result.files_scanned || 0,
			filesIndexed: result.files_indexed || 0,
			filesFailed: result.files_failed || 0,
			chunksAdded: result.chunks_added || 0,
			elapsedMs: result.elapsed_ms || 0,
		})
	}

	async indexUrl(
		serverUrl: string,
		project: string,
		url: string,
		depth: number,
		maxPages: number,
	): Promise<IndexUrlResponse> {
		const client = await this.getClient(serverUrl)
		const result = await client.callTool("index_url", {
			project,
			url,
			depth,
			max_pages: maxPages,
		})
		return IndexUrlResponse.create({
			project: result.project || project,
			seedUrl: result.seed_url || url,
			pagesCrawled: result.pages_crawled || 0,
			chunksAdded: result.chunks_added || 0,
		})
	}

	async uploadFile(serverUrl: string, project: string): Promise<UploadFileResponse> {
		const uris = await vscode.window.showOpenDialog({
			canSelectMany: false,
			title: "Select a document to upload",
			filters: {
				Documents: ["pdf", "docx", "pptx", "xlsx", "xls", "md", "txt", "csv", "html", "htm"],
			},
		})
		if (!uris || uris.length === 0) {
			return UploadFileResponse.create({ project, filename: "", path: "", size: 0, status: "cancelled" })
		}
		const filePath = uris[0].fsPath
		const client = await this.getClient(serverUrl)
		const result = await client.uploadFile(project, filePath)
		return UploadFileResponse.create({
			project: result.project,
			filename: result.filename,
			path: result.path,
			size: result.size,
			status: result.status,
		})
	}

	async searchDocuments(
		serverUrl: string,
		project: string,
		query: string,
		topK: number,
	): Promise<SearchDocumentsResponse> {
		const client = await this.getClient(serverUrl)
		const result = await client.callTool("search_documents", {
			project,
			query,
			top_k: topK,
		})
		const results = (result.results || []).map(
			(r: any) =>
				SearchResult.create({
					text: r.text || "",
					score: r.score || 0,
					hybridScore: r.hybrid_score || 0,
					metadata: JSON.stringify(r.metadata || {}),
				}),
		)
		return SearchDocumentsResponse.create({
			project: result.project || project,
			query: result.query || query,
			results,
		})
	}

	listDocsIndexTools(): DocsIndexTools {
		return DocsIndexTools.create({ tools: toProtoTools() })
	}

	async registerMcpServer(serverUrl: string): Promise<void> {
		await this.mcpRegistration.register(serverUrl)
	}

	async unregisterMcpServer(): Promise<void> {
		await this.mcpRegistration.unregister()
	}

	dispose(): void {
		for (const client of this.clients.values()) {
			client.close().catch((err) => Logger.error("[DocsIndex] dispose close error:", err))
		}
		this.clients.clear()
	}
}
```

- [ ] **Step 3: Write failing test for DocsIndexFacade**

Create `apps/vscode/src/services/docs-index/__tests__/DocsIndexFacade.test.ts`:

```typescript
import { describe, expect, mock, test } from "bun:test"

// Mock VesselIndexerClient
const mockCallTool = mock(async (toolName: string, args: Record<string, unknown>) => {
	if (toolName === "list_projects") {
		return {
			projects: [
				{ name: "greenenergy", mount_path: "/data/projects/greenenergy", total_chunks: 279, status: "indexed" },
			],
		}
	}
	if (toolName === "project_stats") {
		return { project: "greenenergy", total_chunks: 279, files_indexed: 2, by_format: { pdf: 278, txt: 1 } }
	}
	if (toolName === "index_project") {
		return { files_scanned: 3, files_indexed: 1, files_failed: 0, chunks_added: 278, elapsed_ms: 6271 }
	}
	if (toolName === "search_documents") {
		return {
			project: "greenenergy",
			query: "OCPP",
			results: [{ text: "OCPP specification...", score: 0.862, hybrid_score: 0.827, metadata: { path: "...", page: 3 } }],
		}
	}
	return {}
})

mock.module("../VesselIndexerClient", () => ({
	VesselIndexerClient: class MockVesselIndexerClient {
		connect = mock(async () => {})
		callTool = mockCallTool
		uploadFile = mock(async () => ({
			project: "greenenergy",
			filename: "doc.pdf",
			path: "/data/projects/greenenergy/doc.pdf",
			size: 1048576,
			status: "indexed",
		}))
		close = mock(async () => {})
	},
}))

mock.module("@services/mcp/settingsLock", () => ({
	updateMcpSettingsFile: mock(async () => {}),
}))

const { DocsIndexFacade } = await import("../DocsIndexFacade")

describe("DocsIndexFacade", () => {
	test("ping returns connected=true when list_projects succeeds", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.ping("http://localhost:20130")
		expect(result.connected).toBe(true)
	})

	test("listProjects maps snake_case to camelCase proto fields", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.listProjects("http://localhost:20130")
		expect(result.projects.length).toBe(1)
		expect(result.projects[0].name).toBe("greenenergy")
		expect(result.projects[0].mountPath).toBe("/data/projects/greenenergy")
		expect(result.projects[0].totalChunks).toBe(279)
	})

	test("projectStats maps by_format map correctly", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.projectStats("http://localhost:20130", "greenenergy")
		expect(result.totalChunks).toBe(279)
		expect(result.filesIndexed).toBe(2)
		expect(result.byFormat["pdf"]).toBe(278)
	})

	test("indexDocsProject maps response fields", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.indexDocsProject("http://localhost:20130", "greenenergy")
		expect(result.filesScanned).toBe(3)
		expect(result.filesIndexed).toBe(1)
		expect(result.chunksAdded).toBe(278)
		expect(result.elapsedMs).toBe(6271)
	})

	test("searchDocuments maps results with metadata as JSON string", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.searchDocuments("http://localhost:20130", "greenenergy", "OCPP", 10)
		expect(result.results.length).toBe(1)
		expect(result.results[0].score).toBe(0.862)
		expect(result.results[0].metadata).toContain("page")
	})

	test("listDocsIndexTools returns 6 tools", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = facade.listDocsIndexTools()
		expect(result.tools.length).toBe(6)
		expect(result.tools[0].name).toBe("search_documents")
	})
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx bun test src/services/docs-index/__tests__/DocsIndexFacade.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Write test for McpRegistrationService**

Create `apps/vscode/src/services/docs-index/__tests__/McpRegistrationService.test.ts`:

```typescript
import { describe, expect, mock, test } from "bun:test"

let capturedSettings: Record<string, unknown> | null = null

mock.module("@services/mcp/settingsLock", () => ({
	updateMcpSettingsFile: mock(async (_path: string, mutator: (settings: Record<string, unknown>) => void) => {
		const settings: Record<string, unknown> = { mcpServers: {} }
		capturedSettings = settings
		mutator(settings)
	}),
}))

const { McpRegistrationService } = await import("../McpRegistrationService")
const { MCP_SERVER_KEY } = await import("../constants")

describe("McpRegistrationService", () => {
	test("register writes streamableHttp entry with correct URL", async () => {
		const svc = new McpRegistrationService({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		await svc.register("http://localhost:20130")
		const servers = (capturedSettings as any)?.mcpServers
		expect(servers[MCP_SERVER_KEY]).toBeDefined()
		expect(servers[MCP_SERVER_KEY].type).toBe("streamableHttp")
		expect(servers[MCP_SERVER_KEY].url).toBe("http://localhost:20130/mcp")
		expect(servers[MCP_SERVER_KEY].disabled).toBe(false)
	})

	test("unregister removes the entry", async () => {
		const svc = new McpRegistrationService({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		await svc.register("http://localhost:20130")
		await svc.unregister()
		const servers = (capturedSettings as any)?.mcpServers
		expect(servers[MCP_SERVER_KEY]).toBeUndefined()
	})
})
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx bun test src/services/docs-index/__tests__/McpRegistrationService.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/vscode/src/services/docs-index/McpRegistrationService.ts apps/vscode/src/services/docs-index/DocsIndexFacade.ts apps/vscode/src/services/docs-index/__tests__/
git commit -m "feat: add DocsIndexFacade and McpRegistrationService"
```

---

### Task 4: Controller Handlers + SdkController Wiring

**Files:**
- Create: `apps/vscode/src/core/controller/docsIndex/ping.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/listProjects.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/projectStats.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/indexDocsProject.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/indexUrl.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/uploadFile.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/searchDocuments.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/listDocsIndexTools.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/registerMcpServer.ts`
- Create: `apps/vscode/src/core/controller/docsIndex/unregisterMcpServer.ts`
- Modify: `apps/vscode/src/sdk/SdkController.ts:43,191,277,698`

**Interfaces:**
- Consumes: `DocsIndexFacade` from Task 3, proto types from `@shared/proto/cline/docs_index`, `Controller` type from `@core/controller`
- Produces: 10 exported async handler functions, one per RPC
- Produces: `controller.docsIndex: DocsIndexFacade` field on the Controller class

- [ ] **Step 1: Create the 10 handler files**

Create `apps/vscode/src/core/controller/docsIndex/ping.ts`:

```typescript
import { PingRequest } from "@shared/proto/cline/docs_index"
import { PingResponse } from "@shared/proto/cline/docs_index"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../index"

export async function ping(controller: Controller, request: PingRequest): Promise<PingResponse> {
	try {
		return await controller.docsIndex.ping(request.serverUrl)
	} catch (error) {
		Logger.error("Failed to ping docs-index:", error)
		return PingResponse.create({ connected: false, serverVersion: "" })
	}
}
```

Create `apps/vscode/src/core/controller/docsIndex/listProjects.ts`:

```typescript
import { ListProjectsRequest, ListProjectsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function listProjects(controller: Controller, request: ListProjectsRequest): Promise<ListProjectsResponse> {
	return await controller.docsIndex.listProjects(request.serverUrl)
}
```

Create `apps/vscode/src/core/controller/docsIndex/projectStats.ts`:

```typescript
import { ProjectStatsRequest, ProjectStatsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function projectStats(controller: Controller, request: ProjectStatsRequest): Promise<ProjectStatsResponse> {
	return await controller.docsIndex.projectStats(request.serverUrl, request.project)
}
```

Create `apps/vscode/src/core/controller/docsIndex/indexDocsProject.ts`:

```typescript
import { DocsIndexProjectRequest, DocsIndexProjectResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function indexDocsProject(controller: Controller, request: DocsIndexProjectRequest): Promise<DocsIndexProjectResponse> {
	return await controller.docsIndex.indexDocsProject(request.serverUrl, request.project)
}
```

Create `apps/vscode/src/core/controller/docsIndex/indexUrl.ts`:

```typescript
import { IndexUrlRequest, IndexUrlResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function indexUrl(controller: Controller, request: IndexUrlRequest): Promise<IndexUrlResponse> {
	return await controller.docsIndex.indexUrl(request.serverUrl, request.project, request.url, request.depth, request.maxPages)
}
```

Create `apps/vscode/src/core/controller/docsIndex/uploadFile.ts`:

```typescript
import { UploadFileRequest, UploadFileResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function uploadFile(controller: Controller, request: UploadFileRequest): Promise<UploadFileResponse> {
	return await controller.docsIndex.uploadFile(request.serverUrl, request.project)
}
```

Create `apps/vscode/src/core/controller/docsIndex/searchDocuments.ts`:

```typescript
import { SearchDocumentsRequest, SearchDocumentsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function searchDocuments(
	controller: Controller,
	request: SearchDocumentsRequest,
): Promise<SearchDocumentsResponse> {
	return await controller.docsIndex.searchDocuments(request.serverUrl, request.project, request.query, request.topK)
}
```

Create `apps/vscode/src/core/controller/docsIndex/listDocsIndexTools.ts`:

```typescript
import { EmptyRequest } from "@shared/proto/cline/common"
import { DocsIndexTools } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function listDocsIndexTools(controller: Controller, _request: EmptyRequest): Promise<DocsIndexTools> {
	return controller.docsIndex.listDocsIndexTools()
}
```

Create `apps/vscode/src/core/controller/docsIndex/registerMcpServer.ts`:

```typescript
import { Empty } from "@shared/proto/cline/common"
import { RegisterMcpRequest } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function registerMcpServer(controller: Controller, request: RegisterMcpRequest): Promise<Empty> {
	await controller.docsIndex.registerMcpServer(request.serverUrl)
	return Empty.create()
}
```

Create `apps/vscode/src/core/controller/docsIndex/unregisterMcpServer.ts`:

```typescript
import { Empty, EmptyRequest } from "@shared/proto/cline/common"
import { UnregisterMcpRequest } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function unregisterMcpServer(controller: Controller, _request: UnregisterMcpRequest): Promise<Empty> {
	await controller.docsIndex.unregisterMcpServer()
	return Empty.create()
}
```

- [ ] **Step 2: Re-run proto generation to wire handlers into protobus-services.ts**

Run: `npm run protos`
Expected: The generated `protobus-services.ts` now includes imports from `@core/controller/docsIndex/*` and a `DocsIndexServiceHandlers` object. The `serviceHandlers` map includes `"cline.DocsIndexService": DocsIndexServiceHandlers`.

If the generation does NOT automatically pick up the new handlers (it should, since it scans the controller directory), manually verify by checking:

Run: `grep -n "DocsIndexService" src/generated/hosts/vscode/protobus-services.ts`
Expected: Lines with `import { ping } from "@core/controller/docsIndex/ping"` etc., and `"cline.DocsIndexService": DocsIndexServiceHandlers` in the export.

- [ ] **Step 3: Wire DocsIndexFacade into SdkController**

In `apps/vscode/src/sdk/SdkController.ts`:

1. Add import after the `CodebaseMemoryFacade` import (line 43):

```typescript
import { DocsIndexFacade } from "@/services/docs-index/DocsIndexFacade"
```

2. Add field after `codebaseMemory` field (line 191):

```typescript
	docsIndex: DocsIndexFacade
```

3. Add construction after `this.codebaseMemory = new CodebaseMemoryFacade(...)` (line 277):

```typescript
		this.docsIndex = new DocsIndexFacade(this.mcpHub)
```

4. Add disposal after `this.codebaseMemory?.dispose()` (line 698):

```typescript
		this.docsIndex?.dispose()
```

- [ ] **Step 4: Run typecheck**

Run: `npm run check-types`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add apps/vscode/src/core/controller/docsIndex/ apps/vscode/src/sdk/SdkController.ts apps/vscode/src/generated/
git commit -m "feat: add docs-index controller handlers and SdkController wiring"
```

---

### Task 5: ConnectionCard + ToolsCard UI Components

**Files:**
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/ConnectionCard.tsx`
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/ToolsCard.tsx`

**Interfaces:**
- Consumes: `DocsIndexServiceClient` from `@/services/grpc-client`, `PingRequest`/`PingResponse`/`EmptyRequest`/`DocsIndexTool`/`DocsIndexTools` from `@shared/proto/cline/docs_index` and `@shared/proto/cline/common`
- Consumes: `DEFAULT_SERVER_URL` constant from `@shared/proto/cline/docs_index` (actually: the default is hardcoded in the component since constants.ts is a backend file)
- Produces: `ConnectionCard` component with props: `serverUrl`, `setServerUrl`, `connected`, `setConnected`, `onConnected` callback
- Produces: `ToolsCard` component with no props (fetches its own data)

- [ ] **Step 1: Create ConnectionCard.tsx**

Create `apps/vscode/webview-ui/src/components/settings/sections/docs-index/ConnectionCard.tsx`:

```tsx
import { useState } from "react"
import { PingRequest, RegisterMcpRequest } from "@shared/proto/cline/docs_index"
import { EmptyRequest } from "@shared/proto/cline/common"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface ConnectionCardProps {
	serverUrl: string
	setServerUrl: (url: string) => void
	connected: boolean
	setConnected: (connected: boolean) => void
	onConnected: () => void
}

export default function ConnectionCard({
	serverUrl,
	setServerUrl,
	connected,
	setConnected,
	onConnected,
}: ConnectionCardProps) {
	const [connecting, setConnecting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleConnect = async () => {
		setConnecting(true)
		setError(null)
		try {
			const result = await DocsIndexServiceClient.ping(PingRequest.create({ serverUrl }))
			if (result.connected) {
				setConnected(true)
				await DocsIndexServiceClient.registerMcpServer(RegisterMcpRequest.create({ serverUrl }))
				onConnected()
			} else {
				setError("Could not connect to the server. Make sure it is running.")
			}
		} catch (err) {
			setError(`Connection failed: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setConnecting(false)
		}
	}

	const handleDisconnect = async () => {
		try {
			await DocsIndexServiceClient.unregisterMcpServer(EmptyRequest.create({}))
		} catch (err) {
			console.error("Failed to unregister MCP server:", err)
		}
		setConnected(false)
	}

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Connection</div>
			<div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
				<input
					type="text"
					value={serverUrl}
					onChange={(e) => setServerUrl(e.target.value)}
					disabled={connected || connecting}
					placeholder="http://localhost:20130"
					style={{
						flex: 1,
						padding: "4px 8px",
						fontSize: "12px",
						background: "var(--vscode-input-background)",
						color: "var(--vscode-input-foreground)",
						border: "1px solid var(--vscode-input-border)",
						borderRadius: "3px",
					}}
				/>
				{connected ? (
					<button
						onClick={handleDisconnect}
						style={{
							padding: "4px 12px",
							fontSize: "12px",
							cursor: "pointer",
							background: "var(--vscode-button-secondaryBackground)",
							color: "var(--vscode-button-secondaryForeground)",
							border: "none",
							borderRadius: "3px",
						}}>
						Disconnect
					</button>
				) : (
					<button
						onClick={handleConnect}
						disabled={connecting || !serverUrl}
						style={{
							padding: "4px 12px",
							fontSize: "12px",
							cursor: connecting || !serverUrl ? "not-allowed" : "pointer",
							background: "var(--vscode-button-background)",
							color: "var(--vscode-button-foreground)",
							border: "none",
							borderRadius: "3px",
							opacity: connecting || !serverUrl ? 0.7 : 1,
						}}>
						{connecting ? "Connecting..." : "Connect"}
					</button>
				)}
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
				<span
					style={{
						display: "inline-block",
						width: "8px",
						height: "8px",
						borderRadius: "50%",
						background: connected
							? "var(--vscode-testing-iconPassed)"
							: "var(--vscode-testing-iconFailed)",
					}}
				/>
				<span style={{ color: "var(--vscode-descriptionForeground)" }}>
					{connected ? "Connected" : "Not connected"}
				</span>
			</div>
			{error && (
				<div
					style={{
						marginTop: "8px",
						fontSize: "12px",
						color: "var(--vscode-errorForeground)",
					}}>
					{error}
				</div>
			)}
		</div>
	)
}
```

- [ ] **Step 2: Create ToolsCard.tsx**

Create `apps/vscode/webview-ui/src/components/settings/sections/docs-index/ToolsCard.tsx`:

```tsx
import { useEffect, useState } from "react"
import { EmptyRequest } from "@shared/proto/cline/common"
import type { DocsIndexTool } from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

export default function ToolsCard() {
	const [tools, setTools] = useState<DocsIndexTool[]>([])

	useEffect(() => {
		DocsIndexServiceClient.listDocsIndexTools(EmptyRequest.create({}))
			.then((response) => setTools(response.tools ?? []))
			.catch((e) => console.error("Failed to list docs-index tools:", e))
	}, [])

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
				Available MCP Tools ({tools.length})
			</div>
			<div
				style={{
					fontSize: "12px",
					color: "var(--vscode-descriptionForeground)",
					marginBottom: "8px",
				}}>
				These tools are available to your agent after connecting:
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
				{tools.map((tool) => (
					<div key={tool.name} style={{ fontSize: "12px", lineHeight: "1.4" }}>
						<span style={{ color: "var(--vscode-foreground)", fontWeight: 600 }}>{tool.name}</span>
						<span style={{ color: "var(--vscode-descriptionForeground)" }}> — {tool.description}</span>
					</div>
				))}
			</div>
		</div>
	)
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check-types`
Expected: PASS (no errors related to docs-index components)

- [ ] **Step 4: Commit**

```bash
git add apps/vscode/webview-ui/src/components/settings/sections/docs-index/ConnectionCard.tsx apps/vscode/webview-ui/src/components/settings/sections/docs-index/ToolsCard.tsx
git commit -m "feat: add ConnectionCard and ToolsCard for docs-index UI"
```

---

### Task 6: ProjectsCard + IndexCard + UploadCard

**Files:**
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/ProjectsCard.tsx`
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/UploadCard.tsx`
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/IndexCard.tsx`

**Interfaces:**
- Consumes: `DocsIndexServiceClient` from `@/services/grpc-client`, proto types from `@shared/proto/cline/docs_index`
- Consumes: `connected`, `serverUrl`, `selectedProject`, `setSelectedProject` props from parent
- Produces: `ProjectsCard`, `UploadCard`, `IndexCard` components

- [ ] **Step 1: Create ProjectsCard.tsx**

Create `apps/vscode/webview-ui/src/components/settings/sections/docs-index/ProjectsCard.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react"
import {
	ListProjectsRequest,
	ProjectStatsRequest,
	type ProjectInfo,
	type ProjectStatsResponse,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface ProjectsCardProps {
	serverUrl: string
	connected: boolean
	projects: ProjectInfo[]
	setProjects: (projects: ProjectInfo[]) => void
	selectedProject: string
	setSelectedProject: (project: string) => void
}

export default function ProjectsCard({
	serverUrl,
	connected,
	projects,
	setProjects,
	selectedProject,
	setSelectedProject,
}: ProjectsCardProps) {
	const [stats, setStats] = useState<ProjectStatsResponse | undefined>()
	const [loading, setLoading] = useState(false)

	const refreshProjects = useCallback(async () => {
		if (!connected) return
		setLoading(true)
		try {
			const response = await DocsIndexServiceClient.listProjects(ListProjectsRequest.create({ serverUrl }))
			setProjects(response.projects ?? [])
			if (response.projects.length > 0 && !selectedProject) {
				setSelectedProject(response.projects[0].name)
			}
		} catch (err) {
			console.error("Failed to list projects:", err)
		} finally {
			setLoading(false)
		}
	}, [serverUrl, connected, setProjects, selectedProject, setSelectedProject])

	useEffect(() => {
		if (connected) {
			refreshProjects()
		}
	}, [connected, refreshProjects])

	useEffect(() => {
		if (!connected || !selectedProject) {
			setStats(undefined)
			return
		}
		DocsIndexServiceClient.projectStats(ProjectStatsRequest.create({ serverUrl, project: selectedProject }))
			.then(setStats)
			.catch((err) => console.error("Failed to get project stats:", err))
	}, [connected, serverUrl, selectedProject])

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: connected ? 1 : 0.5,
			}}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
				<div style={{ fontSize: "13px", fontWeight: 600 }}>Projects</div>
				<button
					onClick={refreshProjects}
					disabled={!connected || loading}
					style={{
						padding: "2px 8px",
						fontSize: "11px",
						cursor: !connected || loading ? "not-allowed" : "pointer",
						background: "var(--vscode-button-secondaryBackground)",
						color: "var(--vscode-button-secondaryForeground)",
						border: "none",
						borderRadius: "3px",
					}}>
					{loading ? "Loading..." : "Refresh"}
				</button>
			</div>
			<select
				value={selectedProject}
				onChange={(e) => setSelectedProject(e.target.value)}
				disabled={!connected || projects.length === 0}
				style={{
					width: "100%",
					padding: "4px 8px",
					fontSize: "12px",
					background: "var(--vscode-dropdown-background)",
					color: "var(--vscode-dropdown-foreground)",
					border: "1px solid var(--vscode-dropdown-border)",
					borderRadius: "3px",
					marginBottom: "8px",
				}}>
				{projects.length === 0 && <option value="">No projects available</option>}
				{projects.map((p) => (
					<option key={p.name} value={p.name}>
						{p.name} ({p.totalChunks} chunks)
					</option>
				))}
			</select>
			{stats && (
				<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)", display: "flex", flexDirection: "column", gap: "2px" }}>
					<div>Total chunks: {stats.totalChunks}</div>
					<div>Files indexed: {stats.filesIndexed}</div>
					{Object.entries(stats.byFormat).length > 0 && (
						<div>
							Formats:{" "}
							{Object.entries(stats.byFormat)
								.map(([fmt, count]) => `${fmt}: ${count}`)
								.join(", ")}
						</div>
					)}
				</div>
			)}
		</div>
	)
}
```

- [ ] **Step 2: Create UploadCard.tsx**

Create `apps/vscode/webview-ui/src/components/settings/sections/docs-index/UploadCard.tsx`:

```tsx
import { useState } from "react"
import { UploadFileRequest, type UploadFileResponse } from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface UploadCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function UploadCard({ serverUrl, connected, selectedProject }: UploadCardProps) {
	const [uploading, setUploading] = useState(false)
	const [result, setResult] = useState<UploadFileResponse | undefined>()
	const [error, setError] = useState<string | null>(null)

	const handleUpload = async () => {
		setUploading(true)
		setError(null)
		setResult(undefined)
		try {
			const response = await DocsIndexServiceClient.uploadFile(
				UploadFileRequest.create({ serverUrl, project: selectedProject }),
			)
			setResult(response)
		} catch (err) {
			setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setUploading(false)
		}
	}

	const disabled = !connected || !selectedProject

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: disabled ? 0.5 : 1,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Upload Document</div>
			<button
				onClick={handleUpload}
				disabled={disabled || uploading}
				style={{
					padding: "4px 12px",
					fontSize: "12px",
					cursor: disabled || uploading ? "not-allowed" : "pointer",
					background: "var(--vscode-button-background)",
					color: "var(--vscode-button-foreground)",
					border: "none",
					borderRadius: "3px",
					opacity: disabled || uploading ? 0.7 : 1,
				}}>
				{uploading ? "Uploading..." : "Upload File"}
			</button>
			{result && (
				<div
					style={{
						marginTop: "8px",
						fontSize: "12px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					{result.status === "cancelled" ? (
						"Upload cancelled"
					) : (
						<>
							Uploaded <strong>{result.filename}</strong> ({(result.size / 1024).toFixed(1)} KB) — {result.status}
						</>
					)}
				</div>
			)}
			{error && (
				<div
					style={{
						marginTop: "8px",
						fontSize: "12px",
						color: "var(--vscode-errorForeground)",
					}}>
					{error}
				</div>
			)}
		</div>
	)
}
```

- [ ] **Step 3: Create IndexCard.tsx**

Create `apps/vscode/webview-ui/src/components/settings/sections/docs-index/IndexCard.tsx`:

```tsx
import { useState } from "react"
import {
	DocsIndexProjectRequest,
	IndexUrlRequest,
	type DocsIndexProjectResponse,
	type IndexUrlResponse,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface IndexCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function IndexCard({ serverUrl, connected, selectedProject }: IndexCardProps) {
	const [indexing, setIndexing] = useState(false)
	const [indexResult, setIndexResult] = useState<DocsIndexProjectResponse | undefined>()
	const [urlInput, setUrlInput] = useState("")
	const [depth, setDepth] = useState(3)
	const [maxPages, setMaxPages] = useState(50)
	const [urlIndexing, setUrlIndexing] = useState(false)
	const [urlResult, setUrlResult] = useState<IndexUrlResponse | undefined>()
	const [error, setError] = useState<string | null>(null)

	const disabled = !connected || !selectedProject

	const handleIndexProject = async () => {
		setIndexing(true)
		setError(null)
		setIndexResult(undefined)
		try {
			const response = await DocsIndexServiceClient.indexDocsProject(
				DocsIndexProjectRequest.create({ serverUrl, project: selectedProject }),
			)
			setIndexResult(response)
		} catch (err) {
			setError(`Index failed: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setIndexing(false)
		}
	}

	const handleIndexUrl = async () => {
		setUrlIndexing(true)
		setError(null)
		setUrlResult(undefined)
		try {
			const response = await DocsIndexServiceClient.indexUrl(
				IndexUrlRequest.create({
					serverUrl,
					project: selectedProject,
					url: urlInput,
					depth,
					maxPages,
				}),
			)
			setUrlResult(response)
		} catch (err) {
			setError(`URL index failed: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setUrlIndexing(false)
		}
	}

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: disabled ? 0.5 : 1,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Indexing</div>

			{/* Index Project */}
			<div style={{ marginBottom: "12px" }}>
				<button
					onClick={handleIndexProject}
					disabled={disabled || indexing}
					style={{
						padding: "4px 12px",
						fontSize: "12px",
						cursor: disabled || indexing ? "not-allowed" : "pointer",
						background: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
						border: "none",
						borderRadius: "3px",
						opacity: disabled || indexing ? 0.7 : 1,
					}}>
					{indexing ? "Indexing..." : "Index Project"}
				</button>
				{indexResult && (
					<div
						style={{
							marginTop: "6px",
							fontSize: "12px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						Scanned {indexResult.filesScanned}, indexed {indexResult.filesIndexed} new,{" "}
						{indexResult.chunksAdded} chunks added ({(indexResult.elapsedMs / 1000).toFixed(1)}s)
					</div>
				)}
			</div>

			{/* URL Indexing */}
			<div style={{ borderTop: "1px solid var(--vscode-panel-border)", paddingTop: "12px" }}>
				<div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>Index URL</div>
				<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
					<input
						type="text"
						value={urlInput}
						onChange={(e) => setUrlInput(e.target.value)}
						disabled={disabled}
						placeholder="https://example.com"
						style={{
							padding: "4px 8px",
							fontSize: "12px",
							background: "var(--vscode-input-background)",
							color: "var(--vscode-input-foreground)",
							border: "1px solid var(--vscode-input-border)",
							borderRadius: "3px",
						}}
					/>
					<div style={{ display: "flex", gap: "8px" }}>
						<label style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
							Depth:{" "}
							<input
								type="number"
								value={depth}
								onChange={(e) => setDepth(Number(e.target.value))}
								disabled={disabled}
								min={1}
								max={10}
								style={{ width: "40px", fontSize: "12px" }}
							/>
						</label>
						<label style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
							Max pages:{" "}
							<input
								type="number"
								value={maxPages}
								onChange={(e) => setMaxPages(Number(e.target.value))}
								disabled={disabled}
								min={1}
								max={500}
								style={{ width: "50px", fontSize: "12px" }}
							/>
						</label>
					</div>
					<button
						onClick={handleIndexUrl}
						disabled={disabled || urlIndexing || !urlInput}
						style={{
							padding: "4px 12px",
							fontSize: "12px",
							cursor: disabled || urlIndexing || !urlInput ? "not-allowed" : "pointer",
							background: "var(--vscode-button-background)",
							color: "var(--vscode-button-foreground)",
							border: "none",
							borderRadius: "3px",
							opacity: disabled || urlIndexing || !urlInput ? 0.7 : 1,
							alignSelf: "flex-start",
						}}>
						{urlIndexing ? "Crawling..." : "Index URL"}
					</button>
					{urlResult && (
						<div
							style={{
								fontSize: "12px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							Crawled {urlResult.pagesCrawled} pages, {urlResult.chunksAdded} chunks added
						</div>
					)}
				</div>
			</div>

			{error && (
				<div
					style={{
						marginTop: "8px",
						fontSize: "12px",
						color: "var(--vscode-errorForeground)",
					}}>
					{error}
				</div>
			)}
		</div>
	)
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run check-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/vscode/webview-ui/src/components/settings/sections/docs-index/ProjectsCard.tsx apps/vscode/webview-ui/src/components/settings/sections/docs-index/UploadCard.tsx apps/vscode/webview-ui/src/components/settings/sections/docs-index/IndexCard.tsx
git commit -m "feat: add ProjectsCard, UploadCard, and IndexCard for docs-index UI"
```

---

### Task 7: SearchCard + DocsIndexSection + SettingsView Tab

**Files:**
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/SearchCard.tsx`
- Create: `apps/vscode/webview-ui/src/components/settings/sections/DocsIndexSection.tsx`
- Modify: `apps/vscode/webview-ui/src/components/settings/SettingsView.tsx`

**Interfaces:**
- Consumes: All card components from Tasks 5-6, `DocsIndexServiceClient` from `@/services/grpc-client`
- Produces: `SearchCard` component with props: `serverUrl`, `connected`, `selectedProject`
- Produces: `DocsIndexSection` default export component (no props)
- Produces: New `"docs-index"` tab in `SettingsView`

- [ ] **Step 1: Create SearchCard.tsx**

Create `apps/vscode/webview-ui/src/components/settings/sections/docs-index/SearchCard.tsx`:

```tsx
import { useState } from "react"
import {
	SearchDocumentsRequest,
	type SearchDocumentsResponse,
	type SearchResult,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface SearchCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function SearchCard({ serverUrl, connected, selectedProject }: SearchCardProps) {
	const [query, setQuery] = useState("")
	const [topK, setTopK] = useState(10)
	const [searching, setSearching] = useState(false)
	const [results, setResults] = useState<SearchResult[]>([])
	const [hasSearched, setHasSearched] = useState(false)

	const disabled = !connected || !selectedProject

	const handleSearch = async () => {
		if (!query.trim()) return
		setSearching(true)
		setHasSearched(true)
		try {
			const response = await DocsIndexServiceClient.searchDocuments(
				SearchDocumentsRequest.create({
					serverUrl,
					project: selectedProject,
					query,
					topK,
				}),
			)
			setResults(response.results ?? [])
		} catch (err) {
			console.error("Search failed:", err)
			setResults([])
		} finally {
			setSearching(false)
		}
	}

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: disabled ? 0.5 : 1,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Search Documents</div>
			<div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && !disabled && !searching && handleSearch()}
					disabled={disabled}
					placeholder="Search query..."
					style={{
						flex: 1,
						padding: "4px 8px",
						fontSize: "12px",
						background: "var(--vscode-input-background)",
						color: "var(--vscode-input-foreground)",
						border: "1px solid var(--vscode-input-border)",
						borderRadius: "3px",
					}}
				/>
				<button
					onClick={handleSearch}
					disabled={disabled || searching || !query.trim()}
					style={{
						padding: "4px 12px",
						fontSize: "12px",
						cursor: disabled || searching || !query.trim() ? "not-allowed" : "pointer",
						background: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
						border: "none",
						borderRadius: "3px",
						opacity: disabled || searching || !query.trim() ? 0.7 : 1,
					}}>
					{searching ? "Searching..." : "Search"}
				</button>
			</div>
			<div style={{ marginBottom: "8px" }}>
				<label style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
					Results:{" "}
					<input
						type="number"
						value={topK}
						onChange={(e) => setTopK(Number(e.target.value))}
						disabled={disabled}
						min={1}
						max={50}
						style={{ width: "50px", fontSize: "12px" }}
					/>
				</label>
			</div>
			{hasSearched && (
				<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
					{results.length === 0 ? (
						<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
							No results found.
						</div>
					) : (
						results.map((result, i) => {
							let metadata: Record<string, any> = {}
							try {
								metadata = JSON.parse(result.metadata)
							} catch {}
							return (
								<div
									key={i}
									style={{
										padding: "8px",
										border: "1px solid var(--vscode-panel-border)",
										borderRadius: "3px",
										fontSize: "12px",
									}}>
									<div style={{ marginBottom: "4px" }}>
										{result.text.length > 200 ? result.text.slice(0, 200) + "..." : result.text}
									</div>
									<div
										style={{
											display: "flex",
											gap: "8px",
											fontSize: "11px",
											color: "var(--vscode-descriptionForeground)",
										}}>
										<span>Score: {(result.score * 100).toFixed(1)}%</span>
										<span>Hybrid: {(result.hybridScore * 100).toFixed(1)}%</span>
										{metadata.file_type && <span>Type: {metadata.file_type}</span>}
										{metadata.page && <span>Page: {metadata.page}</span>}
									</div>
								</div>
							)
						})
					)}
				</div>
			)}
		</div>
	)
}
```

- [ ] **Step 2: Create DocsIndexSection.tsx**

Create `apps/vscode/webview-ui/src/components/settings/sections/DocsIndexSection.tsx`:

```tsx
import { useCallback, useState } from "react"
import type { ProjectInfo } from "@shared/proto/cline/docs_index"
import ConnectionCard from "./docs-index/ConnectionCard"
import IndexCard from "./docs-index/IndexCard"
import ProjectsCard from "./docs-index/ProjectsCard"
import SearchCard from "./docs-index/SearchCard"
import ToolsCard from "./docs-index/ToolsCard"
import UploadCard from "./docs-index/UploadCard"

export const DocsIndexSection = () => {
	const [serverUrl, setServerUrl] = useState("http://localhost:20130")
	const [connected, setConnected] = useState(false)
	const [projects, setProjects] = useState<ProjectInfo[]>([])
	const [selectedProject, setSelectedProject] = useState("")

	const handleConnected = useCallback(() => {
		// ProjectsCard will auto-fetch when connected becomes true
	}, [])

	return (
		<div className="flex flex-col gap-6 px-4 py-3">
			<ConnectionCard
				serverUrl={serverUrl}
				setServerUrl={setServerUrl}
				connected={connected}
				setConnected={setConnected}
				onConnected={handleConnected}
			/>
			<ProjectsCard
				serverUrl={serverUrl}
				connected={connected}
				projects={projects}
				setProjects={setProjects}
				selectedProject={selectedProject}
				setSelectedProject={setSelectedProject}
			/>
			<UploadCard serverUrl={serverUrl} connected={connected} selectedProject={selectedProject} />
			<IndexCard serverUrl={serverUrl} connected={connected} selectedProject={selectedProject} />
			<SearchCard serverUrl={serverUrl} connected={connected} selectedProject={selectedProject} />
			<ToolsCard />
		</div>
	)
}

export default DocsIndexSection
```

- [ ] **Step 3: Register the tab in SettingsView.tsx**

In `apps/vscode/webview-ui/src/components/settings/SettingsView.tsx`:

1. Add import for `FileText` icon (add to the existing lucide-react import block at lines 5-15):

```typescript
	FileText,
```

2. Add import for `DocsIndexSection` after the `CodebaseMemorySection` import (line 33):

```typescript
import DocsIndexSection from "./sections/DocsIndexSection"
```

3. Add `"docs-index"` to the `SettingsTabID` type (line 39):

Change:
```typescript
type SettingsTabID = "api-config" | "features" | "terminal" | "general" | "project" | "debug" | "remote-config" | "codebase-memory"
```
To:
```typescript
type SettingsTabID = "api-config" | "features" | "terminal" | "general" | "project" | "debug" | "remote-config" | "codebase-memory" | "docs-index"
```

4. Add tab definition after the `"codebase-memory"` tab (after line 100, before the `// Only show in dev mode` comment):

```typescript
	{
		id: "docs-index",
		name: "Document Index",
		tooltipText: "Document Indexing & Search",
		headerText: "Document Index",
		icon: FileText,
	},
```

5. Add to `TAB_CONTENT_MAP` (after `"codebase-memory": CodebaseMemorySection,` at line 144):

```typescript
			"docs-index": DocsIndexSection,
```

- [ ] **Step 4: Run typecheck**

Run: `npm run check-types`
Expected: PASS

- [ ] **Step 5: Run webview build**

Run: `cd webview-ui && npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 6: Commit**

```bash
git add apps/vscode/webview-ui/src/components/settings/sections/docs-index/SearchCard.tsx apps/vscode/webview-ui/src/components/settings/sections/DocsIndexSection.tsx apps/vscode/webview-ui/src/components/settings/SettingsView.tsx
git commit -m "feat: add SearchCard, DocsIndexSection, and Document Index settings tab"
```

---

### Task 8: Full Build + Test + Smoke Test

**Files:**
- No new files — verification only

- [ ] **Step 1: Run proto generation (final)**

Run: `npm run protos`
Expected: All 25 proto files processed, no errors.

- [ ] **Step 2: Run typecheck**

Run: `npm run check-types`
Expected: PASS (0 errors)

- [ ] **Step 3: Run full compile**

Run: `npm run compile`
Expected: PASS (esbuild produces dist/extension.js)

- [ ] **Step 4: Run webview build**

Run: `cd webview-ui && npx tsc --noEmit && npx vite build`
Expected: PASS (build/ directory produced)

- [ ] **Step 5: Run unit tests**

Run: `npm run test:unit`
Expected: All docs-index tests pass. Pre-existing failures in other test suites are acceptable.

- [ ] **Step 6: Run full package build**

Run: `npm run package`
Expected: PASS (all steps: protos, check-types, build:webview, lint, esbuild)

- [ ] **Step 7: Run VSIX packaging**

Run: `npm run package-vsix`
Expected: `DONE Packaged: .../cellock-ai-*.vsix`

- [ ] **Step 8: Manual smoke test**

Press F5 in VSCode to launch Extension Development Host. Then:

1. Open Cline settings → scroll to "Document Index" tab → click it
2. Verify URL field shows `http://localhost:20130` (or user enters their URL)
3. Click "Connect" → status shows "Connected" with green dot
4. Check `.cellockai/mcp_settings.json` — should contain `"vessel-indexer"` entry with `"type": "streamableHttp"`
5. Project dropdown populates with projects from the server
6. Select a project → stats appear (total chunks, files indexed, format breakdown)
7. Click "Upload File" → VSCode file picker opens → select a PDF → result shows filename, size, "indexed"
8. Click "Index Project" → loading spinner → result shows files scanned, chunks added
9. Enter a URL in the Index URL form → click "Index URL" → result shows pages crawled, chunks added
10. Type a search query → click "Search" → results appear with text snippets, scores, metadata
11. Tools card shows 6 tools with descriptions
12. In chat, ask "search greenenergy for OCPP" → agent uses `search_documents` MCP tool

- [ ] **Step 9: Commit any remaining changes**

```bash
git status
git add -A
git commit -m "feat: complete document index UI integration"
```
