# Docindex Crawl CRUD + Depth/Page Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the docindex backend's new same-domain crawler + crawl CRUD in the VS Code extension: replace single-page "Index URL" with a depth/page-capped Crawl, add a Crawls list (refresh/delete), and persist depth/page defaults per project.

**Architecture:** The extension talks to the docindex REST API via `VesselIndexerClient` (host side). Each REST call is wrapped by a `DocsIndexFacade` method, exposed as a gRPC RPC (`DocsIndexService` in `proto/cline/docs_index.proto`), regenerated to TS, and invoked from the webview via `DocsIndexServiceClient`. This plan adds 5 RPCs (`crawlUrl`, `listCrawls`, `getCrawl`, `refreshCrawl`, `deleteCrawl`), extends `DocumentInfo` + the settings messages, and updates the UI. `bun run protos` regenerates the proto TS **and** the `protobus-services.ts` handler wiring — never hand-edit generated files.

**Tech Stack:** TypeScript, React, protobuf-ts (ts-proto), bun:test, vitest. Backend contract verified against `/Users/harry/Desktop/ai.cellock.mcpserver` (rust-version branch, HEAD `8be7029`).

## Global Constraints

- Backend REST shapes are FIXED (verified against backend route handlers + DTO structs, not the prose summary). Field names are snake_case on the wire.
- `crawl_id` = UUID v5(project|root_url) — deterministic; re-crawling the same root is idempotent.
- Defaults: depth `3`, max_pages `50` (match backend `CRAWL_MAX_DEPTH`/`CRAWL_MAX_PAGES`).
- `delay_secs` is NOT exposed (server default `1s`). The `/urls` GET list view is NOT wired (crawl docs already surface in `DocumentsCard` via the new `source_url`/`crawl_id`). YAGNI.
- Generated files (`src/shared/proto/**`, `src/generated/**`) are regenerated, never hand-edited.
- Run a single test file with `bun test <file>` (NOT `bun <file>`) so `bunfig` preload applies; co-located `mock.module` tests leak process-wide, so run each file separately.
- Do NOT commit/push/repackage without explicit user confirmation.

## File Structure

- **T1** `src/services/docs-index/VesselIndexerClient.ts` (+ `__tests__/VesselIndexerClient.test.ts`) — REST methods + DTOs. No proto dep.
- **T2** `src/services/docs-index/DocsIndexSettingsService.ts` (+ `__tests__/DocsIndexSettingsService.test.ts`) — crawl settings fields + merge. No proto dep.
- **T3** `proto/cline/docs_index.proto` (source of truth) → `bun run protos` → 5 new handlers `src/core/controller/docsIndex/{crawlUrl,listCrawls,getCrawl,refreshCrawl,deleteCrawl}.ts` (+ handler tests) → `DocsIndexFacade.ts` methods + settings threading → `webview-ui/src/services/grpc-client.ts` 5 methods. Depends on T1, T2.
- **T4** `webview-ui/src/components/settings/sections/docs-index/IndexCard.tsx` (+ `IndexCard.test.tsx`) — depth/maxPages + Crawl button; self-loads crawl settings. Depends on T3.
- **T5** `webview-ui/src/components/settings/sections/docs-index/CrawlsCard.tsx` (new, + `CrawlsCard.test.tsx`) + `DocsIndexSection.tsx` mount. Depends on T3.
- **T6** verify + build vsix. Depends on T4, T5.

Wave order: T1 ∥ T2 → T3 → T4 ∥ T5 → T6.

---

## Task 1: REST client — crawl CRUD methods

**Files:**
- Modify: `src/services/docs-index/VesselIndexerClient.ts`
- Test: `src/services/docs-index/__tests__/VesselIndexerClient.test.ts` (create)

**Interfaces:**
- Produces: `CrawlInfo` (exported interface), extended `DocInfo` (`source_url?`, `crawl_id?`), methods `crawlUrl`, `listCrawls`, `getCrawl`, `refreshCrawl`, `deleteCrawl`, updated `indexUrl` return type. Consumed by T3's facade.

- [ ] **Step 1: Add `CrawlInfo` type and extend `DocInfo`**

At the top of `VesselIndexerClient.ts`, extend the existing `DocInfo` and add `CrawlInfo`:

```ts
export interface DocInfo {
	source: string
	bytes: number
	page_count: number
	chunk_count: number
	content_hash: string
	url: string
	/** Real crawled URL (absent for file uploads / legacy docs). */
	source_url?: string
	/** Crawl this page belongs to (absent for uploads). */
	crawl_id?: string
}

export interface CrawlInfo {
	crawl_id: string
	root_url: string
	status: string
	max_depth: number
	max_pages: number
	page_count: number
	created_at: string
}

export interface CrawlDetail {
	crawl: CrawlInfo
	pages: DocInfo[]
}
```

- [ ] **Step 2: Update `indexUrl` return type** (backend now also returns `crawl_id`)

```ts
async indexUrl(project: string, url: string): Promise<{ crawl_id: string; task_id: string }> {
	const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/urls`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url }),
	})
	if (!response.ok) throw new Error(`Index URL failed: ${response.status} ${response.statusText}`)
	return await response.json()
}
```

- [ ] **Step 3: Add the 5 crawl methods** (append inside the class, before the closing brace)

```ts
/** Same-domain BFS crawl. `maxDepth`/`maxPages` fall back to server defaults when omitted. */
async crawlUrl(
	project: string,
	url: string,
	maxDepth?: number,
	maxPages?: number,
): Promise<{ crawl_id: string; task_id: string }> {
	const body: { url: string; max_depth?: number; max_pages?: number } = { url }
	if (maxDepth != null) body.max_depth = maxDepth
	if (maxPages != null) body.max_pages = maxPages
	const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/crawls`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
	if (!response.ok) throw new Error(`Crawl URL failed: ${response.status} ${response.statusText}`)
	return await response.json()
}

async listCrawls(project: string): Promise<CrawlInfo[]> {
	const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/crawls`)
	if (!response.ok) throw new Error(`List crawls failed: ${response.status} ${response.statusText}`)
	return await response.json()
}

async getCrawl(project: string, crawlId: string): Promise<CrawlDetail> {
	const response = await fetch(
		`${this.serverUrl}/projects/${encodeURIComponent(project)}/crawls/${encodeURIComponent(crawlId)}`,
	)
	if (!response.ok) throw new Error(`Get crawl failed: ${response.status} ${response.statusText}`)
	return await response.json()
}

/** Re-crawl an existing crawl row. Returns a task id to poll. */
async refreshCrawl(project: string, crawlId: string): Promise<{ task_id: string }> {
	const response = await fetch(
		`${this.serverUrl}/projects/${encodeURIComponent(project)}/crawls/${encodeURIComponent(crawlId)}/refresh`,
		{ method: "POST" },
	)
	if (!response.ok) throw new Error(`Refresh crawl failed: ${response.status} ${response.statusText}`)
	return await response.json()
}

async deleteCrawl(project: string, crawlId: string): Promise<{ status: string }> {
	const response = await fetch(
		`${this.serverUrl}/projects/${encodeURIComponent(project)}/crawls/${encodeURIComponent(crawlId)}`,
		{ method: "DELETE" },
	)
	if (!response.ok) throw new Error(`Delete crawl failed: ${response.status} ${response.statusText}`)
	return await response.json()
}
```

- [ ] **Step 4: Write tests** (`__tests__/VesselIndexerClient.test.ts`)

Mock global `fetch`; assert method, path, body, and response parsing for `crawlUrl` (with and without optional caps), `listCrawls` (bare array), `getCrawl` (`{crawl, pages}`), `refreshCrawl`, `deleteCrawl`. Pattern:

```ts
import { afterEach, describe, expect, it, mock } from "bun:test"
import { CrawlInfo, VesselIndexerClient } from "../VesselIndexerClient"

const json = (body: unknown, ok = true) =>
	Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as any)

describe("VesselIndexerClient crawl", () => {
	const original = globalThis.fetch
	afterEach(() => {
		globalThis.fetch = original
	})

	it("crawlUrl POSTs body with caps and returns crawl_id+task_id", async () => {
		let captured: any
		globalThis.fetch = mock((input: any, init?: any) => {
			captured = { url: input, init }
			return json({ crawl_id: "c1", task_id: "t1" }, true)
		}) as any
		const c = new VesselIndexerClient("http://srv")
		const out = await c.crawlUrl("proj", "https://x.io", 3, 50)
		expect(out).toEqual({ crawl_id: "c1", task_id: "t1" })
		expect(captured.url).toBe("http://srv/projects/proj/crawls")
		expect(captured.init.method).toBe("POST")
		expect(JSON.parse(captured.init.body)).toEqual({ url: "https://x.io", max_depth: 3, max_pages: 50 })
	})

	it("crawlUrl omits caps when not provided", async () => {
		let captured: any
		globalThis.fetch = mock((input: any, init?: any) => {
			captured = { url: input, init }
			return json({ crawl_id: "c1", task_id: "t1" })
		}) as any
		await new VesselIndexerClient("http://srv").crawlUrl("proj", "https://x.io")
		expect(JSON.parse(captured.init.body)).toEqual({ url: "https://x.io" })
	})

	it("listCrawls returns the bare array", async () => {
		const rows = [{ crawl_id: "c1", root_url: "r", status: "done", max_depth: 3, max_pages: 50, page_count: 2, created_at: "1" }]
		globalThis.fetch = mock(() => json(rows)) as any
		const out = await new VesselIndexerClient("http://srv").listCrawls("proj")
		expect(out).toEqual(rows)
	})

	it("getCrawl returns {crawl, pages}", async () => {
		globalThis.fetch = mock(() => json({ crawl: { crawl_id: "c1" }, pages: [] })) as any
		const out = await new VesselIndexerClient("http://srv").getCrawl("proj", "c1")
		expect(out.crawl.crawl_id).toBe("c1")
		expect(out.pages).toEqual([])
	})

	it("refreshCrawl POSTs to /refresh and returns task_id", async () => {
		let captured: any
		globalThis.fetch = mock((input: any, init?: any) => {
			captured = { url: input, init }
			return json({ task_id: "t9" }, true)
		}) as any
		const out = await new VesselIndexerClient("http://srv").refreshCrawl("proj", "c1")
		expect(out).toEqual({ task_id: "t9" })
		expect(captured.init.method).toBe("POST")
		expect(captured.url).toBe("http://srv/projects/proj/crawls/c1/refresh")
	})

	it("deleteCrawl DELETEs and returns status", async () => {
		let captured: any
		globalThis.fetch = mock((input: any, init?: any) => {
			captured = { url: input, init }
			return json({ status: "deleted" })
		}) as any
		const out = await new VesselIndexerClient("http://srv").deleteCrawl("proj", "c1")
		expect(out).toEqual({ status: "deleted" })
		expect(captured.init.method).toBe("DELETE")
	})

	it("throws on non-ok", async () => {
		globalThis.fetch = mock(() => json({}, false)) as any
		expect(new VesselIndexerClient("http://srv").listCrawls("p")).rejects.toThrow(/List crawls failed/)
	})
})
```

- [ ] **Step 5: Run the test**

Run: `bun test src/services/docs-index/__tests__/VesselIndexerClient.test.ts`
Expected: all pass.

---

## Task 2: Settings — crawlMaxDepth / crawlMaxPages

**Files:**
- Modify: `src/services/docs-index/DocsIndexSettingsService.ts`
- Test: `src/services/docs-index/__tests__/DocsIndexSettingsService.test.ts`

**Interfaces:**
- Produces: `DocsIndexSettings` gains `crawlMaxDepth: number` + `crawlMaxPages: number` (defaults 3 / 50), with workspace-override merge. Consumed by T3's `getDocsIndexSettings`/`updateDocsIndexSettings` facade methods.

- [ ] **Step 1: Extend the interface + DEFAULTS**

```ts
export interface DocsIndexSettings {
	serverUrl: string
	lastProjects: Record<string, string>
	crawlMaxDepth: number
	crawlMaxPages: number
}

const DEFAULTS: DocsIndexSettings = {
	serverUrl: DEFAULT_SERVER_URL,
	lastProjects: {},
	crawlMaxDepth: 3,
	crawlMaxPages: 50,
}
```

- [ ] **Step 2: Extend `get()` merge**

In `get()`, after computing `serverUrl`/`lastProjects` from the global file, read the workspace file and let it override crawl fields too. Replace the workspace-override return block with:

```ts
const wsPath = await getProjectDocsIndexSettingsFilePath()
if (wsPath !== getGlobalDocsIndexSettingsFilePath()) {
	const wsRaw = await readJsonConfigFile<Partial<DocsIndexSettings>>(wsPath)
	if (wsRaw) {
		if (wsRaw.lastProjects && typeof wsRaw.lastProjects === "object") {
			Object.assign(lastProjects, wsRaw.lastProjects)
		}
		return {
			serverUrl: typeof wsRaw.serverUrl === "string" ? wsRaw.serverUrl : serverUrl,
			lastProjects,
			crawlMaxDepth: numOrDefault(wsRaw.crawlMaxDepth, DEFAULTS.crawlMaxDepth),
			crawlMaxPages: numOrDefault(wsRaw.crawlMaxPages, DEFAULTS.crawlMaxPages),
		}
	}
}
return {
	serverUrl,
	lastProjects,
	crawlMaxDepth: DEFAULTS.crawlMaxDepth,
	crawlMaxPages: DEFAULTS.crawlMaxPages,
}
```

Add a small module-level helper near `DEFAULTS`:

```ts
const numOrDefault = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d)
```

- [ ] **Step 3: Extend `update()` write branches**

In the workspace-write branch, build `next` including crawl fields:

```ts
const next: DocsIndexSettings = {
	serverUrl:
		patch.serverUrl != null
			? patch.serverUrl
			: typeof wsRaw?.serverUrl === "string"
				? wsRaw.serverUrl
				: DEFAULTS.serverUrl,
	lastProjects: { ...(wsRaw?.lastProjects ?? {}), ...(patch.lastProjects ?? {}) },
	crawlMaxDepth: patch.crawlMaxDepth != null ? patch.crawlMaxDepth : numOrDefault(wsRaw?.crawlMaxDepth, DEFAULTS.crawlMaxDepth),
	crawlMaxPages: patch.crawlMaxPages != null ? patch.crawlMaxPages : numOrDefault(wsRaw?.crawlMaxPages, DEFAULTS.crawlMaxPages),
}
await writeJsonConfigFileAtomic(wsPath, next)
```

In the global-write branch (no workspace), likewise include crawl fields from `current`/`patch`:

```ts
const next: DocsIndexSettings = {
	serverUrl: patch.serverUrl != null ? patch.serverUrl : current.serverUrl,
	lastProjects:
		patch.lastProjects != null ? { ...current.lastProjects, ...patch.lastProjects } : current.lastProjects,
	crawlMaxDepth: patch.crawlMaxDepth != null ? patch.crawlMaxDepth : current.crawlMaxDepth,
	crawlMaxPages: patch.crawlMaxPages != null ? patch.crawlMaxPages : current.crawlMaxPages,
}
await writeJsonConfigFileAtomic(globalPath, next)
```

- [ ] **Step 4: Add tests** to `DocsIndexSettingsService.test.ts`

Add (reusing the file's existing temp-dir/mock patterns): (a) `get()` returns defaults `3`/`50` when nothing is stored; (b) workspace file `crawlMaxDepth`/`crawlMaxPages` override global; (c) `update({crawlMaxDepth: 7})` writes `7` to the workspace file and preserves other keys.

- [ ] **Step 5: Run the test**

Run: `bun test src/services/docs-index/__tests__/DocsIndexSettingsService.test.ts`
Expected: all pass (existing + new).

---

## Task 3: Proto + handlers + facade + grpc-client wiring

**Files:**
- Modify: `proto/cline/docs_index.proto`
- Create: `src/core/controller/docsIndex/{crawlUrl,listCrawls,getCrawl,refreshCrawl,deleteCrawl}.ts` (+ handler tests in `__tests__/`)
- Modify: `src/services/docs-index/DocsIndexFacade.ts`, `src/core/controller/docsIndex/getDocsIndexSettings.ts`, `src/core/controller/docsIndex/updateDocsIndexSettings.ts`
- Regenerate (do NOT hand-edit): `src/shared/proto/cline/docs_index.ts`, `src/generated/hosts/vscode/protobus-services.ts`, `src/generated/hosts/vscode/protobus-service-types.ts`
- Modify: `webview-ui/src/services/grpc-client.ts`

**Interfaces:**
- Consumes: T1 `VesselIndexerClient` methods + `CrawlInfo`/`CrawlDetail`; T2 `DocsIndexSettings.crawlMaxDepth`/`crawlMaxPages`.
- Produces: gRPC RPCs `crawlUrl`, `listCrawls`, `getCrawl`, `refreshCrawl`, `deleteCrawl`; extended `DocumentInfo`; settings fields `crawl_max_depth`/`crawl_max_pages`. Consumed by T4 + T5.

- [ ] **Step 1: Edit the proto service block** — add 5 rpcs after the `indexUrl` line:

```proto
  rpc crawlUrl(CrawlUrlRequest) returns (CrawlUrlResponse);
  rpc listCrawls(ListCrawlsRequest) returns (ListCrawlsResponse);
  rpc getCrawl(GetCrawlRequest) returns (GetCrawlResponse);
  rpc refreshCrawl(RefreshCrawlRequest) returns (RefreshCrawlResponse);
  rpc deleteCrawl(DeleteCrawlRequest) returns (DeleteCrawlResponse);
```

- [ ] **Step 2: Add proto messages** — append at end of the file:

```proto
message CrawlUrlRequest {
  string server_url = 1;
  string project = 2;
  string url = 3;
  int32 max_depth = 4;
  int32 max_pages = 5;
}

message CrawlUrlResponse {
  string crawl_id = 1;
  string task_id = 2;
  string project = 3;
  string status = 4;
}

message ListCrawlsRequest {
  string server_url = 1;
  string project = 2;
}

message CrawlInfo {
  string crawl_id = 1;
  string root_url = 2;
  string status = 3;
  int32 max_depth = 4;
  int32 max_pages = 5;
  int32 page_count = 6;
  string created_at = 7;
}

message ListCrawlsResponse {
  repeated CrawlInfo crawls = 1;
}

message GetCrawlRequest {
  string server_url = 1;
  string project = 2;
  string crawl_id = 3;
}

message GetCrawlResponse {
  CrawlInfo crawl = 1;
  repeated DocumentInfo pages = 2;
}

message RefreshCrawlRequest {
  string server_url = 1;
  string project = 2;
  string crawl_id = 3;
}

message RefreshCrawlResponse {
  string task_id = 1;
}

message DeleteCrawlRequest {
  string server_url = 1;
  string project = 2;
  string crawl_id = 3;
}

message DeleteCrawlResponse {
  string status = 1;
}
```

- [ ] **Step 3: Extend existing proto messages**

`DocumentInfo` (currently fields 1–6) — add:

```proto
  optional string source_url = 7;
  optional string crawl_id = 8;
```

`GetDocsIndexSettingsResponse` (fields 1–2) — add:

```proto
  int32 crawl_max_depth = 3;
  int32 crawl_max_pages = 4;
```

`UpdateDocsIndexSettingsRequest` (fields 1–3) — add:

```proto
  optional int32 crawl_max_depth = 4;
  optional int32 crawl_max_pages = 5;
```

- [ ] **Step 4: Regenerate**

Run: `bun run protos`
Then: `bun run check-types` — expect errors only about missing handler files / facade methods (created next). Confirm `src/generated/hosts/vscode/protobus-services.ts` now imports the 5 new handlers and registers them in `DocsIndexServiceHandlers` (the generator does this by scanning `src/core/controller/docsIndex/` for files matching the rpc names — so create the handler files in Step 5 first if the generator didn't pick them up, then re-run `bun run protos`).

- [ ] **Step 5: Create the 5 handlers** (mirror `listDocuments.ts`)

`src/core/controller/docsIndex/crawlUrl.ts`:
```ts
import { CrawlUrlRequest, CrawlUrlResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function crawlUrl(controller: Controller, request: CrawlUrlRequest): Promise<CrawlUrlResponse> {
	return await controller.docsIndex.crawlUrl(
		request.serverUrl,
		request.project,
		request.url,
		request.maxDepth,
		request.maxPages,
	)
}
```

`src/core/controller/docsIndex/listCrawls.ts`:
```ts
import { ListCrawlsRequest, ListCrawlsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function listCrawls(controller: Controller, request: ListCrawlsRequest): Promise<ListCrawlsResponse> {
	return await controller.docsIndex.listCrawls(request.serverUrl, request.project)
}
```

`src/core/controller/docsIndex/getCrawl.ts`:
```ts
import { GetCrawlRequest, GetCrawlResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function getCrawl(controller: Controller, request: GetCrawlRequest): Promise<GetCrawlResponse> {
	return await controller.docsIndex.getCrawl(request.serverUrl, request.project, request.crawlId)
}
```

`src/core/controller/docsIndex/refreshCrawl.ts`:
```ts
import { RefreshCrawlRequest, RefreshCrawlResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function refreshCrawl(controller: Controller, request: RefreshCrawlRequest): Promise<RefreshCrawlResponse> {
	return await controller.docsIndex.refreshCrawl(request.serverUrl, request.project, request.crawlId)
}
```

`src/core/controller/docsIndex/deleteCrawl.ts`:
```ts
import { DeleteCrawlRequest, DeleteCrawlResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function deleteCrawl(controller: Controller, request: DeleteCrawlRequest): Promise<DeleteCrawlResponse> {
	return await controller.docsIndex.deleteCrawl(request.serverUrl, request.project, request.crawlId)
}
```

After creating them, re-run `bun run protos` so `protobus-services.ts` wires them in.

- [ ] **Step 6: Add facade methods** to `DocsIndexFacade.ts`

Add imports: `CrawlInfo`, `CrawlDetail`, `DocInfo` are already imported from `./VesselIndexerClient`; add the new proto response types to the proto import block (`CrawlUrlResponse`, `ListCrawlsResponse`, `GetCrawlResponse`, `RefreshCrawlResponse`, `DeleteCrawlResponse`, `CrawlInfo as CrawlInfoProto` — alias to avoid clash with the REST `CrawlInfo`).

```ts
async crawlUrl(
	serverUrl: string,
	project: string,
	url: string,
	maxDepth: number,
	maxPages: number,
): Promise<CrawlUrlResponse> {
	try {
		const client = new VesselIndexerClient(serverUrl)
		const depth = maxDepth > 0 ? maxDepth : undefined
		const pages = maxPages > 0 ? maxPages : undefined
		const result = await client.crawlUrl(project, url, depth, pages)
		return CrawlUrlResponse.create({
			crawlId: result.crawl_id || "",
			taskId: result.task_id || "",
			project,
			status: "accepted",
		})
	} catch (err) {
		Logger.error("[DocsIndex] crawlUrl failed:", err)
		return CrawlUrlResponse.create({ crawlId: "", taskId: "", project, status: "error" })
	}
}

async listCrawls(serverUrl: string, project: string): Promise<ListCrawlsResponse> {
	try {
		const client = new VesselIndexerClient(serverUrl)
		const crawls = (await client.listCrawls(project)).map((c) =>
			CrawlInfoProto.create({
				crawlId: c.crawl_id || "",
				rootUrl: c.root_url || "",
				status: c.status || "",
				maxDepth: c.max_depth || 0,
				maxPages: c.max_pages || 0,
				pageCount: c.page_count || 0,
				createdAt: c.created_at || "",
			}),
		)
		return ListCrawlsResponse.create({ crawls })
	} catch (err) {
		Logger.error("[DocsIndex] listCrawls failed:", err)
		return ListCrawlsResponse.create({ crawls: [] })
	}
}

async getCrawl(serverUrl: string, project: string, crawlId: string): Promise<GetCrawlResponse> {
	try {
		const client = new VesselIndexerClient(serverUrl)
		const detail = await client.getCrawl(project, crawlId)
		const crawl = CrawlInfoProto.create({
			crawlId: detail.crawl.crawl_id || "",
			rootUrl: detail.crawl.root_url || "",
			status: detail.crawl.status || "",
			maxDepth: detail.crawl.max_depth || 0,
			maxPages: detail.crawl.max_pages || 0,
			pageCount: detail.crawl.page_count || 0,
			createdAt: detail.crawl.created_at || "",
		})
		return GetCrawlResponse.create({ crawl })
	} catch (err) {
		Logger.error("[DocsIndex] getCrawl failed:", err)
		return GetCrawlResponse.create({})
	}
}

async refreshCrawl(serverUrl: string, project: string, crawlId: string): Promise<RefreshCrawlResponse> {
	try {
		const client = new VesselIndexerClient(serverUrl)
		const result = await client.refreshCrawl(project, crawlId)
		return RefreshCrawlResponse.create({ taskId: result.task_id || "" })
	} catch (err) {
		Logger.error("[DocsIndex] refreshCrawl failed:", err)
		return RefreshCrawlResponse.create({ taskId: "" })
	}
}

async deleteCrawl(serverUrl: string, project: string, crawlId: string): Promise<DeleteCrawlResponse> {
	try {
		const client = new VesselIndexerClient(serverUrl)
		const result = await client.deleteCrawl(project, crawlId)
		return DeleteCrawlResponse.create({ status: result.status || "ok" })
	} catch (err) {
		Logger.error("[DocsIndex] deleteCrawl failed:", err)
		return DeleteCrawlResponse.create({ status: "error" })
	}
}
```

Also update `listDocuments` mapping to include the two new optional fields:
```ts
sourceUrl: d.source_url || "",
crawlId: d.crawl_id || "",
```
inside the existing `DocumentInfo.create({...})`.

- [ ] **Step 7: Thread crawl settings through `getDocsIndexSettings` / `updateDocsIndexSettings`**

`src/core/controller/docsIndex/getDocsIndexSettings.ts`:
```ts
import { EmptyRequest } from "@shared/proto/cline/common"
import { GetDocsIndexSettingsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function getDocsIndexSettings(
	controller: Controller,
	_request: EmptyRequest,
): Promise<GetDocsIndexSettingsResponse> {
	const workspacePath = await controller.docsIndex.getWorkspacePath()
	const { serverUrl, lastSelectedProject, crawlMaxDepth, crawlMaxPages } =
		await controller.docsIndex.getDocsIndexSettings(workspacePath)
	return GetDocsIndexSettingsResponse.create({
		serverUrl,
		lastSelectedProject,
		crawlMaxDepth,
		crawlMaxPages,
	})
}
```

`src/core/controller/docsIndex/updateDocsIndexSettings.ts`:
```ts
import { UpdateDocsIndexSettingsRequest, UpdateDocsIndexSettingsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function updateDocsIndexSettings(
	controller: Controller,
	request: UpdateDocsIndexSettingsRequest,
): Promise<UpdateDocsIndexSettingsResponse> {
	const { serverUrl, lastSelectedProject } = await controller.docsIndex.updateDocsIndexSettings(
		request.workspacePath,
		request.serverUrl,
		request.selectedProject,
		request.crawlMaxDepth,
		request.crawlMaxPages,
	)
	return UpdateDocsIndexSettingsResponse.create({ serverUrl, lastSelectedProject })
}
```

Extend `DocsIndexFacade.getDocsIndexSettings` to return `crawlMaxDepth`/`crawlMaxPages` (read from `DocsIndexSettingsService.get()`), and `updateDocsIndexSettings` to accept `(workspacePath, serverUrl?, selectedProject?, crawlMaxDepth?, crawlMaxPages?)` and pass `crawlMaxDepth`/`crawlMaxPages` into `svc.update({...})` when defined. Preserve the existing `lastProjects` keying behavior.

- [ ] **Step 8: Add webview grpc-client methods** (`webview-ui/src/services/grpc-client.ts`), mirroring `indexUrl`:

```ts
static async crawlUrl(request: proto.cline.CrawlUrlRequest): Promise<proto.cline.CrawlUrlResponse> {
	return this.makeUnaryRequest("crawlUrl", request, proto.cline.CrawlUrlRequest.toJSON, proto.cline.CrawlUrlResponse.fromJSON)
}
static async listCrawls(request: proto.cline.ListCrawlsRequest): Promise<proto.cline.ListCrawlsResponse> {
	return this.makeUnaryRequest("listCrawls", request, proto.cline.ListCrawlsRequest.toJSON, proto.cline.ListCrawlsResponse.fromJSON)
}
static async getCrawl(request: proto.cline.GetCrawlRequest): Promise<proto.cline.GetCrawlResponse> {
	return this.makeUnaryRequest("getCrawl", request, proto.cline.GetCrawlRequest.toJSON, proto.cline.GetCrawlResponse.fromJSON)
}
static async refreshCrawl(request: proto.cline.RefreshCrawlRequest): Promise<proto.cline.RefreshCrawlResponse> {
	return this.makeUnaryRequest("refreshCrawl", request, proto.cline.RefreshCrawlRequest.toJSON, proto.cline.RefreshCrawlResponse.fromJSON)
}
static async deleteCrawl(request: proto.cline.DeleteCrawlRequest): Promise<proto.cline.DeleteCrawlResponse> {
	return this.makeUnaryRequest("deleteCrawl", request, proto.cline.DeleteCrawlRequest.toJSON, proto.cline.DeleteCrawlResponse.fromJSON)
}
```

- [ ] **Step 9: Handler tests** — one file per handler in `__tests__/`, mirroring `listDocuments.test.ts` (mock `controller.docsIndex.<method>`, assert delegation + arg forwarding). E.g. `crawlUrl.test.ts` asserts `maxDepth`/`maxPages` are forwarded; `deleteCrawl.test.ts` asserts `crawlId` is forwarded.

- [ ] **Step 10: Compile gate**

Run: `bun run check-types`
Expected: exit 0. Fix any leftover generated-wiring references.

---

## Task 4: IndexCard — depth/maxPages + Crawl

**Files:**
- Modify: `webview-ui/src/components/settings/sections/docs-index/IndexCard.tsx`
- Test: `webview-ui/src/components/settings/sections/docs-index/IndexCard.test.tsx`

**Interfaces:**
- Consumes: T3's `crawlUrl` + `getDocsIndexSettings`/`updateDocsIndexSettings` RPCs and proto types.

- [ ] **Step 1: Rewrite `IndexCard.tsx`** — add depth/maxPages inputs (self-loaded from settings, persisted on change), call `crawlUrl`, keep getTask polling:

```tsx
import { useCallback, useEffect, useRef, useState } from "react"
import { EmptyRequest, type GetDocsIndexSettingsResponse } from "@shared/proto/cline/common"
import {
	CrawlUrlRequest,
	TaskStatusRequest,
	type TaskStatusResponse,
	UpdateDocsIndexSettingsRequest,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface IndexCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
	workspacePath: string
}

export default function IndexCard({ serverUrl, connected, selectedProject, workspacePath }: IndexCardProps) {
	const [urlInput, setUrlInput] = useState("")
	const [maxDepth, setMaxDepth] = useState(3)
	const [maxPages, setMaxPages] = useState(50)
	const [error, setError] = useState<string | null>(null)
	const [task, setTask] = useState<TaskStatusResponse | null>(null)
	const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const disabled = !connected || !selectedProject || activeTaskId !== null

	const stopPolling = useCallback(() => {
		if (pollRef.current) clearInterval(pollRef.current)
		pollRef.current = null
		setActiveTaskId(null)
	}, [])

	useEffect(() => {
		return () => stopPolling()
	}, [stopPolling])

	// Self-load crawl defaults from settings (depth/pages live in docs_index.json).
	useEffect(() => {
		let cancelled = false
		;(async () => {
			try {
				const s: GetDocsIndexSettingsResponse = await DocsIndexServiceClient.getDocsIndexSettings(
					EmptyRequest.create(),
				)
				if (cancelled) return
				if (s.crawlMaxDepth) setMaxDepth(s.crawlMaxDepth)
				if (s.crawlMaxPages) setMaxPages(s.crawlMaxPages)
			} catch {
				/* defaults are fine */
			}
		})()
		return () => {
			cancelled = true
		}
	}, [])

	const persistSetting = async (patch: { crawlMaxDepth?: number; crawlMaxPages?: number }) => {
		try {
			await DocsIndexServiceClient.updateDocsIndexSettings(
				UpdateDocsIndexSettingsRequest.create({ workspacePath, ...patch }),
			)
		} catch (err) {
			setError(`Save setting failed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	const startPolling = (taskId: string) => {
		stopPolling()
		setActiveTaskId(taskId)
		setTask(null)
		const poll = async () => {
			try {
				const t = await DocsIndexServiceClient.getTask(TaskStatusRequest.create({ serverUrl, taskId }))
				setTask(t)
				if (t.status === "done" || t.status === "failed") stopPolling()
			} catch (err) {
				setError(`Poll failed: ${err instanceof Error ? err.message : String(err)}`)
				stopPolling()
			}
		}
		poll()
		pollRef.current = setInterval(poll, 2000)
	}

	const handleCrawl = async () => {
		setError(null)
		setTask(null)
		if (maxDepth < 0 || maxPages < 1) {
			setError("Depth must be ≥ 0 and max pages ≥ 1.")
			return
		}
		try {
			const res = await DocsIndexServiceClient.crawlUrl(
				CrawlUrlRequest.create({
					serverUrl,
					project: selectedProject,
					url: urlInput,
					maxDepth,
					maxPages,
				}),
			)
			if (res.taskId) startPolling(res.taskId)
			else setError("Server did not return a task id")
		} catch (err) {
			setError(`Crawl failed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	const pct = task ? Math.round((task.progress || 0) * 100) : 0
	const inputStyle = {
		width: "5rem",
		padding: "4px 8px",
		fontSize: "12px",
		background: "var(--vscode-input-background)",
		color: "var(--vscode-input-foreground)",
		border: "1px solid var(--vscode-input-border)",
		borderRadius: "3px",
	} as const

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: disabled && !activeTaskId ? 0.5 : 1,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Crawl a URL</div>
			<div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
				<input
					type="text"
					value={urlInput}
					onChange={(e) => setUrlInput(e.target.value)}
					placeholder="https://example.com"
					disabled={disabled}
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
					onClick={handleCrawl}
					disabled={disabled || !urlInput}
					style={{
						padding: "4px 12px",
						fontSize: "12px",
						background: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
						border: "none",
						borderRadius: "3px",
						cursor: disabled || !urlInput ? "not-allowed" : "pointer",
					}}>
					{activeTaskId ? "Crawling…" : "Crawl URL"}
				</button>
			</div>
			<div style={{ display: "flex", gap: "12px", alignItems: "center", fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
				<label>
					Depth{" "}
					<input
						type="number"
						min={0}
						value={maxDepth}
						disabled={disabled}
						onChange={(e) => {
							const v = Math.max(0, Number(e.target.value || 0))
							setMaxDepth(v)
							persistSetting({ crawlMaxDepth: v })
						}}
						style={inputStyle}
					/>
				</label>
				<label>
					Max pages{" "}
					<input
						type="number"
						min={1}
						value={maxPages}
						disabled={disabled}
						onChange={(e) => {
							const v = Math.max(1, Number(e.target.value || 1))
							setMaxPages(v)
							persistSetting({ crawlMaxPages: v })
						}}
						style={inputStyle}
					/>
				</label>
			</div>

			{task && (
				<div
					style={{
						marginTop: "8px",
						fontSize: "12px",
						color:
							task.status === "failed"
								? "var(--vscode-errorForeground)"
								: task.status === "done"
									? "var(--vscode-testing-iconPassed)"
									: "var(--vscode-descriptionForeground)",
					}}>
					{task.status === "done"
						? `Done — ${task.message || "crawled"}`
						: task.status === "failed"
							? `Failed: ${task.detail || task.message || "unknown error"}`
							: `${task.status} ${pct}% — ${task.message || ""}`}
				</div>
			)}
			{error && (
				<div style={{ marginTop: "8px", fontSize: "12px", color: "var(--vscode-errorForeground)" }}>{error}</div>
			)}
		</div>
	)
}
```

Note: `GetDocsIndexSettingsResponse` is generated in `@shared/proto/cline/docs_index`, not `common` — fix the import to pull it from the docs_index module (the snippet's first import line should only import `EmptyRequest` from common). Keep imports honest to the generated file locations.

- [ ] **Step 2: Thread `workspacePath` into IndexCard via `DocsIndexSection.tsx`** — update the one `<IndexCard ... />` site to add `workspacePath={workspacePath}`.

- [ ] **Step 3: Update `IndexCard.test.tsx`** — adjust for the renamed "Crawl URL" button and the two new inputs; add a test asserting `crawlUrl` is called with `maxDepth`/`maxPages` from the inputs. Mock `DocsIndexServiceClient.getDocsIndexSettings` to resolve so the effect doesn't warn.

- [ ] **Step 4: Run tests**

Run: `bun test webview-ui/src/components/settings/sections/docs-index/IndexCard.test.tsx` (or vitest if that file is vitest-configured — check siblings).
Expected: pass.

---

## Task 5: CrawlsCard — list / refresh / delete UI

**Files:**
- Create: `webview-ui/src/components/settings/sections/docs-index/CrawlsCard.tsx`
- Modify: `webview-ui/src/components/settings/sections/DocsIndexSection.tsx`
- Test: `webview-ui/src/components/settings/sections/docs-index/CrawlsCard.test.tsx`

**Interfaces:**
- Consumes: T3's `listCrawls`, `refreshCrawl`, `deleteCrawl`, `getTask` RPCs and the `CrawlInfo` proto type.

- [ ] **Step 1: Create `CrawlsCard.tsx`** — mirror `DocumentsCard.tsx` list pattern:

```tsx
import { useCallback, useEffect, useRef, useState } from "react"
import {
	DeleteCrawlRequest,
	type ListCrawlsResponse,
	ListCrawlsRequest,
	RefreshCrawlRequest,
	type TaskStatusResponse,
	TaskStatusRequest,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface CrawlsCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
	refreshSignal: number
}

type CrawlRow = ListCrawlsResponse["crawls"][number]

export default function CrawlsCard({ serverUrl, connected, selectedProject, refreshSignal }: CrawlsCardProps) {
	const [crawls, setCrawls] = useState<CrawlRow[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")
	const [busyId, setBusyId] = useState<string | null>(null)
	const [taskMsg, setTaskMsg] = useState("")
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const stopPolling = useCallback(() => {
		if (pollRef.current) clearInterval(pollRef.current)
		pollRef.current = null
		setBusyId(null)
	}, [])

	useEffect(() => stopPolling, [stopPolling])

	const reload = useCallback(async () => {
		if (!connected || !selectedProject) {
			setCrawls([])
			return
		}
		setLoading(true)
		setError("")
		try {
			const res = await DocsIndexServiceClient.listCrawls(
				ListCrawlsRequest.create({ serverUrl, project: selectedProject }),
			)
			setCrawls(res.crawls ?? [])
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setLoading(false)
		}
	}, [serverUrl, connected, selectedProject])

	useEffect(() => {
		reload()
	}, [reload, refreshSignal])

	const pollTask = (taskId: string, crawlId: string) => {
		stopPolling()
		setBusyId(crawlId)
		setTaskMsg("refreshing…")
		const poll = async () => {
			try {
				const t: TaskStatusResponse = await DocsIndexServiceClient.getTask(
					TaskStatusRequest.create({ serverUrl, taskId }),
				)
				setTaskMsg(`${t.status}${t.message ? ` — ${t.message}` : ""}`)
				if (t.status === "done" || t.status === "failed") {
					stopPolling()
					setTaskMsg("")
					reload()
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err))
				stopPolling()
				setTaskMsg("")
			}
		}
		poll()
		pollRef.current = setInterval(poll, 2000)
	}

	const handleRefresh = async (crawlId: string) => {
		setError("")
		try {
			const res = await DocsIndexServiceClient.refreshCrawl(
				RefreshCrawlRequest.create({ serverUrl, project: selectedProject, crawlId }),
			)
			if (res.taskId) pollTask(res.taskId, crawlId)
			else setError("Server did not return a task id")
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		}
	}

	const handleDelete = async (crawlId: string) => {
		if (!confirm("Delete this crawl and its indexed pages?")) return
		setError("")
		try {
			await DocsIndexServiceClient.deleteCrawl(
				DeleteCrawlRequest.create({ serverUrl, project: selectedProject, crawlId }),
			)
			await reload()
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		}
	}

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: connected ? 1 : 0.5,
			}}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
				<div style={{ fontSize: "13px", fontWeight: 600 }}>Crawls</div>
				<button
					disabled={loading}
					onClick={reload}
					type="button"
					style={{
						background: "none",
						border: "none",
						color: "var(--vscode-textLink)",
						cursor: "pointer",
						fontSize: "12px",
						padding: 0,
					}}>
					{loading ? "Refreshing…" : "Refresh"}
				</button>
			</div>
			<div style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
				Same-domain crawls in <code>{selectedProject || "(select a project)"}</code>
			</div>
			{!loading && error && <div style={{ fontSize: "12px", color: "var(--vscode-errorForeground)" }}>{error}</div>}
			{!loading && !error && crawls.length === 0 && (
				<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>No crawls yet.</div>
			)}
			{crawls.length > 0 && (
				<ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
					{crawls.map((c) => (
						<li
							key={c.crawlId}
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "2px",
								fontSize: "12px",
								borderTop: "1px solid var(--vscode-panel-border)",
								paddingTop: "6px",
							}}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
								<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.rootUrl}</span>
								<span style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
									<button
										onClick={() => handleRefresh(c.crawlId)}
										disabled={busyId === c.crawlId}
										type="button"
										style={{
											background: "none",
											border: "none",
											color: "var(--vscode-textLink)",
											cursor: "pointer",
											fontSize: "12px",
											padding: 0,
										}}>
										{busyId === c.crawlId ? taskMsg || "…" : "Refresh"}
									</button>
									<button
										onClick={() => handleDelete(c.crawlId)}
										disabled={busyId === c.crawlId}
										type="button"
										style={{
											background: "none",
											border: "none",
											color: "var(--vscode-errorForeground)",
											cursor: "pointer",
											fontSize: "12px",
											padding: 0,
										}}>
										Delete
									</button>
								</span>
							</div>
							<div style={{ color: "var(--vscode-descriptionForeground)" }}>
								{c.status} · {c.pageCount} pages · depth {c.maxDepth}/{c.maxPages}
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
```

- [ ] **Step 2: Mount in `DocsIndexSection.tsx`**

Add the import and render `<CrawlsCard>` directly under `<IndexCard>`:

```tsx
import CrawlsCard from "./docs-index/CrawlsCard"
```
```tsx
<IndexCard connected={connected} selectedProject={selectedProject} serverUrl={serverUrl} workspacePath={workspacePath} />
<CrawlsCard connected={connected} refreshSignal={refreshSignal} selectedProject={selectedProject} serverUrl={serverUrl} />
```

- [ ] **Step 3: Write `CrawlsCard.test.tsx`** — mock `DocsIndexServiceClient.listCrawls` (returns 2 rows), assert render; mock `deleteCrawl` + `confirm` → assert reload called; mock `refreshCrawl` returning a taskId → assert `getTask` polled. Mirror `DocumentsCard.test.tsx` setup.

- [ ] **Step 4: Run tests**

Run: `bun test webview-ui/src/components/settings/sections/docs-index/CrawlsCard.test.tsx`
Expected: pass.

---

## Task 6: Verify + build vsix

**Files:** none (gate only).

- [ ] **Step 1:** `bun run check-types` → expect exit 0.
- [ ] **Step 2:** `bun run lint` → expect exit 0.
- [ ] **Step 3:** Run every new/changed test file **individually** with `bun test <file>` (mock.module leaks process-wide across co-located files):
  - `src/services/docs-index/__tests__/VesselIndexerClient.test.ts`
  - `src/services/docs-index/__tests__/DocsIndexSettingsService.test.ts`
  - `src/core/controller/docsIndex/__tests__/crawlUrl.test.ts` (and the other 4 handler tests)
  - `webview-ui/src/components/settings/sections/docs-index/IndexCard.test.tsx`
  - `webview-ui/src/components/settings/sections/docs-index/CrawlsCard.test.tsx`
- [ ] **Step 4:** `bun run package && bun run package-vsix` → produce fresh `cellock-ai-0.17.6.vsix`.
- [ ] **Step 5:** Report the vsix path + test counts. Do NOT commit/push.

---

## Self-Review

- **Spec coverage:** Crawl create (T1 `crawlUrl` + T3 RPC + T4 UI) ✓; list (T1 + T3 + T5) ✓; get (T1 + T3; UI uses list only — `getCrawl` RPC exists for completeness/agent use) ✓; refresh (T1 + T3 + T5) ✓; delete (T1 + T3 + T5) ✓; depth/page settings (T2 + T3 settings threading + T4 inputs) ✓; `DocumentInfo` provenance (T1 type + T3 proto + T3 facade mapping) ✓.
- **Type consistency:** REST `CrawlInfo` (snake_case) ↔ proto `CrawlInfo` (camelCase via ts-proto) mapped explicitly in T3 facade. `crawlMaxDepth`/`crawlMaxPages` names identical across T2 settings, T3 proto (`crawl_max_depth` → `crawlMaxDepth`), T4 UI. Handler arg names match facade signatures.
- **Placeholders:** none — every step has runnable code or an exact command.
- **Risk:** `getCrawl` RPC is wired but unused by the UI (list view suffices). Kept because the backend exposes it and the agent MCP surface mirrors it; costs one unused-for-now RPC. Acceptable.
