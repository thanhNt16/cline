# Docs List + Project-Level DB MCP + Crash Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a document-list-with-download UI to the Document Indexing tab, save Database MCP servers at project level, and harden against the "jumped back to first screen" crash.

**Architecture:** (1) New `listDocuments` RPC threaded through `VesselIndexerClient` → `DocsIndexFacade` → proto → webview `DocumentsCard`. (2) A `projectLevel` flag on `addStdioMcpServer` routes the Database wizard's write to the workspace file. (3) Backend try/catch around `getStateToPostToWebview` plus a webview guard so a missing `welcomeViewCompleted` can never flip the app to onboarding.

**Tech Stack:** TypeScript, protobuf (proto3), grpc-js + nice-grpc + protobus codegen (`bun run protos`), React webview, vitest.

## Global Constraints

- Proto edits require regen: `bun run protos` (writes `src/shared/proto`, `src/generated/grpc-js`, `src/generated/nice-grpc`, `src/generated/hosts/vscode/*`, `webview-ui/src/services/grpc-client.ts`). Commit all regenerated files.
- New RPC handlers are hand-imported into `src/generated/hosts/vscode/protobus-services.ts` (tracked) — add the import + handler entry manually after regen.
- Test commands: vscode `bun test` (vitest) in `apps/vscode`; webview tests via `cd apps/vscode/webview-ui && bun test`.
- Style: existing `DocsIndexFacade` methods wrap client calls in `try/catch` returning empty results + `Logger.error`. Follow it.
- Type-check: `bun run check-types` in `apps/vscode`.

---

### Task 1: `listDocuments` in VesselIndexerClient + proto + facade

**Files:**
- Modify: `apps/vscode/src/services/docs-index/VesselIndexerClient.ts` (after `deleteDocument`, ~line 175)
- Modify: `apps/vscode/proto/cline/docs_index.proto`
- Modify: `apps/vscode/src/services/docs-index/DocsIndexFacade.ts`
- Modify: `apps/vscode/src/core/controller/docsIndex/listDocuments.ts` (Create)
- Modify: `apps/vscode/src/generated/hosts/vscode/protobus-services.ts` (hand-wire)
- Test: `apps/vscode/src/core/controller/docsIndex/__tests__/listDocuments.test.ts` (Create)

**Interfaces:**
- Produces: `VesselIndexerClient.listDocuments(project: string): Promise<{ documents: DocInfo[] }>` where `DocInfo = { source, bytes, page_count, chunk_count, content_hash, url }`.
- Produces: `DocsIndexFacade.listDocuments(serverUrl: string, project: string): Promise<ListDocumentsResponse>`.
- Produces: controller handler `listDocuments(controller, request: ListDocumentsRequest): Promise<ListDocumentsResponse>`.
- Consumes: proto messages `ListDocumentsRequest { string server_url=1; string project=2; }`, `DocumentInfo { string source=1; int64 bytes=2; int32 page_count=3; int32 chunk_count=4; string content_hash=5; string url=6; }`, `ListDocumentsResponse { repeated DocumentInfo documents=1; }`.

- [ ] **Step 1: Add RPC + messages to proto**

In `apps/vscode/proto/cline/docs_index.proto`, add to `service DocsIndexService` after `deleteDocument`:
```proto
  rpc listDocuments(ListDocumentsRequest) returns (ListDocumentsResponse);
```
Add messages near the `DeleteDocumentResponse` block:
```proto
message ListDocumentsRequest {
  string server_url = 1;
  string project = 2;
}

message DocumentInfo {
  string source = 1;
  int64 bytes = 2;
  int32 page_count = 3;
  int32 chunk_count = 4;
  string content_hash = 5;
  string url = 6;
}

message ListDocumentsResponse {
  repeated DocumentInfo documents = 1;
}
```

- [ ] **Step 2: Regenerate**

Run: `cd apps/vscode && bun run protos`
Expected: regenerated files under `src/shared/proto`, `src/generated`, `webview-ui/src/services/grpc-client.ts` (includes `DocsIndexServiceClient.listDocuments`).

- [ ] **Step 3: Add client method**

In `VesselIndexerClient.ts`, add an interface near `SearchHit` and a method after `deleteDocument`:
```ts
export interface DocInfo {
  source: string
  bytes: number
  page_count: number
  chunk_count: number
  content_hash: string
  url: string
}

async listDocuments(project: string): Promise<{ documents: DocInfo[] }> {
  const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/documents`)
  if (!response.ok) throw new Error(`List documents failed: ${response.status} ${response.statusText}`)
  return await response.json()
}
```

- [ ] **Step 4: Add facade method**

In `DocsIndexFacade.ts`, after `deleteDocument` (before `searchDocuments`):
```ts
async listDocuments(serverUrl: string, project: string): Promise<ListDocumentsResponse> {
  try {
    const client = new VesselIndexerClient(serverUrl)
    const result = await client.listDocuments(project)
    const documents = (result.documents || []).map((d: any) =>
      DocumentInfo.create({
        source: d.source || "",
        bytes: d.bytes || 0,
        page_count: d.page_count || 0,
        chunk_count: d.chunk_count || 0,
        content_hash: d.content_hash || "",
        url: d.url || "",
      }),
    )
    return ListDocumentsResponse.create({ documents })
  } catch (err) {
    Logger.error("[DocsIndex] listDocuments failed:", err)
    return ListDocumentsResponse.create({ documents: [] })
  }
}
```
Add `DocumentInfo`, `ListDocumentsRequest`, `ListDocumentsResponse` to the existing `@shared/proto/cline/docs_index` import.

- [ ] **Step 5: Write the failing controller test**

Create `apps/vscode/src/core/controller/docsIndex/__tests__/listDocuments.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest"
import { ListDocumentsRequest, ListDocumentsResponse } from "@shared/proto/cline/docs_index"
import { listDocuments } from "../listDocuments"

describe("listDocuments controller handler", () => {
  const facade = { listDocuments: vi.fn() }
  const controller: any = { docsIndex: facade }

  beforeEach(() => facade.listDocuments.mockReset())

  it("delegates to facade and returns the response", async () => {
    const resp = ListDocumentsResponse.create({ documents: [{ source: "a.pdf", url: "/projects/p/documents/a.pdf/file" }] })
    facade.listDocuments.mockResolvedValue(resp)
    const req = ListDocumentsRequest.create({ serverUrl: "http://x", project: "p" })
    await expect(listDocuments(controller, req)).resolves.toBe(resp)
    expect(facade.listDocuments).toHaveBeenCalledWith("http://x", "p")
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/vscode && bun test src/core/controller/docsIndex/__tests__/listDocuments.test.ts`
Expected: FAIL — module `../listDocuments` not found.

- [ ] **Step 7: Create controller handler**

Create `apps/vscode/src/core/controller/docsIndex/listDocuments.ts`:
```ts
import { ListDocumentsRequest, ListDocumentsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function listDocuments(controller: Controller, request: ListDocumentsRequest): Promise<ListDocumentsResponse> {
  return await controller.docsIndex.listDocuments(request.serverUrl, request.project)
}
```

- [ ] **Step 8: Hand-wire handler into generated protobus-services.ts**

In `apps/vscode/src/generated/hosts/vscode/protobus-services.ts`:
- Add import: `import { listDocuments } from "@core/controller/docsIndex/listDocuments"` (near the other docsIndex imports, ~line 49).
- Add to `DocsIndexServiceHandlers`: `listDocuments: listDocuments,`

- [ ] **Step 9: Run test to verify it passes**

Run: `cd apps/vscode && bun test src/core/controller/docsIndex/__tests__/listDocuments.test.ts`
Expected: PASS.

- [ ] **Step 10: Type-check + commit**

Run: `cd apps/vscode && bun run check-types`
Expected: no errors.
```bash
git add apps/vscode/proto/cline/docs_index.proto apps/vscode/src/services/docs-index apps/vscode/src/core/controller/docsIndex apps/vscode/src/generated apps/vscode/src/shared/proto apps/vscode/webview-ui/src/services/grpc-client.ts
git commit -m "feat(docs-index): add listDocuments RPC through client, facade, and controller"
```

---

### Task 2: DocumentsCard webview UI

**Files:**
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/DocumentsCard.tsx`
- Create: `apps/vscode/webview-ui/src/components/settings/sections/docs-index/DocumentsCard.test.tsx`
- Modify: `apps/vscode/webview-ui/src/components/settings/sections/DocsIndexSection.tsx`

**Interfaces:**
- Consumes: `DocsIndexServiceClient.listDocuments(request: proto.cline.ListDocumentsRequest): Promise<proto.cline.ListDocumentsResponse>` (generated in Task 1). `ListDocumentsRequest.create({ serverUrl, project })`.
- Consumes: `DocumentInfo` fields: `source`, `bytes`, `page_count`, `chunk_count`, `content_hash`, `url`.
- Props (match sibling cards): `{ serverUrl: string; connected: boolean; selectedProject: string }`.
- Produces: `<DocumentsCard serverUrl connected selectedProject />` rendered in `DocsIndexSection`.

- [ ] **Step 1: Write the failing webview test**

Create `DocumentsCard.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import DocumentsCard from "./DocumentsCard"
import { DocsIndexServiceClient } from "@/services/grpc-client"

const openSpy = vi.spyOn(window, "open").mockReturnValue(null)

const resp = {
  documents: [
    { source: "manual.pdf", bytes: 100, pageCount: 3, chunkCount: 12, contentHash: "abc", url: "" },
    { source: "guide.md", bytes: 200, pageCount: 1, chunkCount: 5, contentHash: "def", url: "" },
  ],
}

describe("DocumentsCard", () => {
  beforeEach(() => {
    openSpy.mockClear()
    vi.spyOn(DocsIndexServiceClient, "listDocuments").mockResolvedValue(resp as any)
  })

  it("lists documents for the selected project", async () => {
    render(<DocumentsCard serverUrl="http://x" connected={true} selectedProject="p" />)
    await waitFor(() => expect(screen.getByText("manual.pdf")).toBeInTheDocument())
    expect(screen.getByText("guide.md")).toBeInTheDocument()
  })

  it("opens the download URL in a new tab", async () => {
    render(<DocumentsCard serverUrl="http://x" connected={true} selectedProject="p" />)
    await waitFor(() => expect(screen.getByText("Download")).toBeTruthy())
    await userEvent.click(screen.getAllByText("Download")[0])
    expect(openSpy).toHaveBeenCalledWith(
      "http://x/projects/p/documents/manual.pdf/file",
      "_blank",
    )
  })

  it("shows empty state when no documents", async () => {
    vi.spyOn(DocsIndexServiceClient, "listDocuments").mockResolvedValue({ documents: [] } as any)
    render(<DocumentsCard serverUrl="http://x" connected={true} selectedProject="p" />)
    await waitFor(() => expect(screen.getByText(/no documents/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/vscode/webview-ui && bun test src/components/settings/sections/docs-index/DocumentsCard.test.tsx`
Expected: FAIL — module `./DocumentsCard` not found.

- [ ] **Step 3: Create DocumentsCard**

Create `DocumentsCard.tsx`:
```tsx
import { useCallback, useEffect, useState } from "react"
import type { DocumentInfo } from "@shared/proto/cline/docs_index"
import { ListDocumentsRequest } from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface DocumentsCardProps {
  serverUrl: string
  connected: boolean
  selectedProject: string
}

export default function DocumentsCard({ serverUrl, connected, selectedProject }: DocumentsCardProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!connected || !selectedProject) {
      setDocuments([])
      return
    }
    setLoading(true)
    try {
      const response = await DocsIndexServiceClient.listDocuments(
        ListDocumentsRequest.create({ serverUrl, project: selectedProject }),
      )
      setDocuments(response.documents ?? [])
    } catch (err) {
      console.error("Failed to list documents:", err)
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [serverUrl, connected, selectedProject])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <div className="rounded border border-vscode-panel-border p-4">
      <h3 className="text-vscode-fontSize font-bold">Documents</h3>
      <p className="text-vscode-descriptionForeground text-sm">
        Uploaded documents in <code>{selectedProject || "(select a project)"}</code>
      </p>
      {loading && <p className="text-vscode-descriptionForeground text-sm">Loading…</p>}
      {!loading && documents.length === 0 && (
        <p className="text-vscode-descriptionForeground text-sm">No documents uploaded.</p>
      )}
      {documents.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {documents.map((doc) => (
            <li key={doc.source} className="flex items-center justify-between text-sm">
              <span className="truncate">{doc.source}</span>
              <a
                className="text-vscode-textLink hover:underline"
                href={`${serverUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(selectedProject)}/documents/${encodeURIComponent(doc.source)}/file`}
                onClick={(e) => {
                  e.preventDefault()
                  window.open(
                    `${serverUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(selectedProject)}/documents/${encodeURIComponent(doc.source)}/file`,
                    "_blank",
                  )
                }}>
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/vscode/webview-ui && bun test src/components/settings/sections/docs-index/DocumentsCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render in DocsIndexSection**

In `apps/vscode/webview-ui/src/components/settings/sections/DocsIndexSection.tsx`:
- Add `import DocumentsCard from "./docs-index/DocumentsCard"`.
- Add `<DocumentsCard serverUrl={serverUrl} connected={connected} selectedProject={selectedProject} />` after `<ProjectsCard … />`.

- [ ] **Step 6: Type-check + commit**

Run: `cd apps/vscode && bun run check-types`
Expected: no errors.
```bash
git add apps/vscode/webview-ui/src/components/settings/sections/docs-index/DocumentsCard.tsx apps/vscode/webview-ui/src/components/settings/sections/docs-index/DocumentsCard.test.tsx apps/vscode/webview-ui/src/components/settings/sections/DocsIndexSection.tsx
git commit -m "feat(docs-index): list uploaded documents with download link in Document Indexing tab"
```

---

### Task 3: Project-level write for Database MCP servers

**Files:**
- Modify: `apps/vscode/proto/cline/mcp.proto` (`AddStdioMcpServerRequest`, add field 8)
- Modify: `apps/vscode/src/core/controller/mcp/addStdioMcpServer.ts`
- Modify: `apps/vscode/src/services/mcp/McpHub.ts` (`addStdioServer`, `resolveMcpWriteFilePath`)
- Modify: `apps/vscode/webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.tsx`
- Test: `apps/vscode/src/services/mcp/__tests__/McpHub.projectLevelWrite.test.ts` (Create)

**Interfaces:**
- Consumes: proto field `AddStdioMcpServerRequest.project_level` (`optional bool`, field 8).
- Produces: `McpHub.addStdioServer(serverName, command, args, env, cwd?, cellockaiPreset?, projectLevel?: boolean)`.
- Produces: `resolveMcpWriteFilePath(serverName?: string, projectLevel?: boolean)`.

- [ ] **Step 1: Add proto field + regen**

In `apps/vscode/proto/cline/mcp.proto`, in `AddStdioMcpServerRequest`:
```proto
  optional bool project_level = 8;
```
Run: `cd apps/vscode && bun run protos`

- [ ] **Step 2: Write the failing test**

Create `apps/vscode/src/services/mcp/__tests__/McpHub.projectLevelWrite.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest"
import { McpHub } from "../McpHub"
import * as settingsLock from "../settingsLock"

describe("McpHub project-level MCP writes", () => {
  let hub: any

  beforeEach(() => {
    hub = new McpHub(
      () => "/tmp/global",
      async () => "/workspace/.cellockai",
      "1.0.0",
      {},
    )
    // Point resolver at distinct global vs workspace files so we can assert the target.
    hub.getWorkspaceMcpSettingsFile = vi.fn().mockResolvedValue("/workspace/.cellockai/mcp_settings.json")
    vi.spyOn(settingsLock, "updateMcpSettingsFile").mockResolvedValue({} as any)
    vi.spyOn(hub, "readPostWriteMcpSettings").mockResolvedValue({ mcpServers: {} } as any)
    vi.spyOn(hub, "updateServerConnectionsRPC").mockResolvedValue(undefined as any)
    hub.getSortedMcpServers = vi.fn().mockReturnValue([])
  })

  it("writes to the workspace file when projectLevel is true", async () => {
    await hub.addStdioServer("db", "npx", [], {}, undefined, "postgres-mcp-toolbox", true)
    expect(settingsLock.updateMcpSettingsFile).toHaveBeenCalledWith(
      "/workspace/.cellockai/mcp_settings.json",
      expect.any(Function),
    )
  })

  it("writes to the global file when projectLevel is false", async () => {
    await hub.addStdioServer("svc", "cmd", [], {})
    expect(settingsLock.updateMcpSettingsFile).toHaveBeenCalledWith(
      "/tmp/global/cline_mcp_settings.json",
      expect.any(Function),
    )
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/vscode && bun test src/services/mcp/__tests__/McpHub.projectLevelWrite.test.ts`
Expected: FAIL — the first case writes to the global path (current behavior).

- [ ] **Step 4: Implement projectLevel routing in McpHub**

In `McpHub.ts`:
- `resolveMcpWriteFilePath(serverName?: string, projectLevel?: boolean)`: when `projectLevel` is true, return `await this.getWorkspaceMcpSettingsFile()` (before the global default).
- `addStdioServer(..., projectLevel?: boolean)`: pass through — `const settingsPath = await this.resolveMcpWriteFilePath(serverName, projectLevel)`.
- No change to `assertNotProjectOverlayOnly` (it still rejects overlay-only servers before the write).

- [ ] **Step 5: Thread flag through controller handler**

In `apps/vscode/src/core/controller/mcp/addStdioMcpServer.ts`, pass `request.projectLevel`:
```ts
const servers = await controller.mcpHub?.addStdioServer(
  request.serverName,
  request.command,
  request.args,
  request.env,
  request.cwd,
  request.cellockaiPreset || undefined,
  request.projectLevel ?? false,
)
```

- [ ] **Step 6: Set projectLevel in Database wizard**

In `AddDatabaseServerForm.tsx`, the `addStdioMcpServer` call gains `projectLevel: true`:
```ts
AddStdioMcpServerRequest.create({
  serverName: cfg.serverName,
  command: cfg.command,
  args: cfg.args,
  env: cfg.env,
  cellockaiPreset: POSTGRES_PRESET,
  projectLevel: true,
}),
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/vscode && bun test src/services/mcp/__tests__/McpHub.projectLevelWrite.test.ts`
Expected: PASS.

- [ ] **Step 8: Type-check + commit**

Run: `cd apps/vscode && bun run check-types`
Expected: no errors.
```bash
git add apps/vscode/proto/cline/mcp.proto apps/vscode/src/core/controller/mcp/addStdioMcpServer.ts apps/vscode/src/services/mcp/McpHub.ts apps/vscode/src/services/mcp/__tests__/McpHub.projectLevelWrite.test.ts apps/vscode/src/generated apps/vscode/src/shared/proto apps/vscode/webview-ui/src/services/grpc-client.ts apps/vscode/webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.tsx
git commit -m "feat(mcp): save Database MCP servers at project level"
```

---

### Task 4: Backend crash guard on state build

**Files:**
- Modify: `apps/vscode/src/core/controller/state/getStateToPostToWebview.ts`
- Test: `apps/vscode/src/core/controller/state/__tests__/getStateToPostToWebview.guard.test.ts` (Create)

**Interfaces:**
- Produces: `getStateToPostToWebview(controller)` never throws; on error returns an `ExtensionState` with `welcomeViewCompleted: true` and logs via `Logger.error`.
- Consumes: existing `ExtensionState` shape (unchanged on the happy path).

- [ ] **Step 1: Write the failing test**

Create `apps/vscode/src/core/controller/state/__tests__/getStateToPostToWebview.guard.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest"
import { getStateToPostToWebview } from "../getStateToPostToWebview"

describe("getStateToPostToWebview crash guard", () => {
  const makeController = (overrides = {}) => ({
    stateManager: {
      getApiConfiguration: vi.fn().mockReturnValue({}),
      getGlobalStateKey: vi.fn().mockReturnValue(undefined),
      getGlobalSettingsKey: vi.fn().mockReturnValue(undefined),
      getWorkspaceStateKey: vi.fn().mockReturnValue(undefined),
      getRemoteConfigSettings: vi.fn().mockReturnValue(undefined),
    },
    workspaceManager: { getPrimaryRoot: vi.fn().mockReturnValue(undefined), getRoots: vi.fn().mockReturnValue([]) },
    workspaceHistoryIndex: { getTaskIds: vi.fn().mockResolvedValue(new Set()) },
    ...overrides,
  })

  beforeEach(() => vi.restoreAllMocks())

  it("returns a state with welcomeViewCompleted true when the build throws", async () => {
    const badStateManager = {
      getApiConfiguration: vi.fn().mockImplementation(() => {
        throw new Error("boom")
      }),
      getGlobalStateKey: vi.fn().mockReturnValue(undefined),
      getGlobalSettingsKey: vi.fn().mockReturnValue(undefined),
      getWorkspaceStateKey: vi.fn().mockReturnValue(undefined),
      getRemoteConfigSettings: vi.fn().mockReturnValue(undefined),
    }
    const state = await getStateToPostToWebview(makeController({ stateManager: badStateManager }) as any)
    expect(state.welcomeViewCompleted).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/vscode && bun test src/core/controller/state/__tests__/getStateToPostToWebview.guard.test.ts`
Expected: FAIL — test rejects with "boom" (the function currently throws).

- [ ] **Step 3: Wrap the body**

In `getStateToPostToWebview.ts`, change the exported function to delegate to an internal `buildState(controller)` wrapped in try/catch:
```ts
export async function getStateToPostToWebview(controller): Promise<ExtensionState> {
  try {
    return await buildState(controller)
  } catch (error) {
    Logger.error("[getStateToPostToWebview] state build failed; returning safe fallback:", error)
    // welcomeViewCompleted must stay truthy: a falsy/missing value flips the
    // webview to onboarding. Other fields are best-effort on the happy path.
    return { welcomeViewCompleted: true } as ExtensionState
  }
}
```
Move the existing body into `async function buildState(controller)` (add `Logger` to imports if not already imported). The happy path return value is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/vscode && bun test src/core/controller/state/__tests__/getStateToPostToWebview.guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vscode/src/core/controller/state/getStateToPostToWebview.ts apps/vscode/src/core/controller/state/__tests__/getStateToPostToWebview.guard.test.ts
git commit -m "fix(state): never throw from getStateToPostToWebview; keep welcomeViewCompleted true on failure"
```

---

### Task 5: Webview guard — no accidental flip to onboarding

**Files:**
- Modify: `apps/vscode/webview-ui/src/context/ExtensionStateContext.tsx` (state-receive effect, ~line 485)

**Interfaces:**
- Consumes: `newState.welcomeViewCompleted` from the state subscription message.
- Produces: onboarding shown only on explicit `welcomeViewCompleted === false`; never flips when already hydrated with a task.

- [ ] **Step 1: Write the failing test**

Locate the existing `ExtensionStateContext` tests (e.g. `apps/vscode/webview-ui/src/context/__tests__/ExtensionStateContext.test.tsx` or similar; create if absent). Add:
```tsx
import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useExtensionState } from "../ExtensionStateContext"

describe("ExtensionStateContext onboarding guard", () => {
  it("does not set showWelcome when welcomeViewCompleted is missing from state", () => {
    const { result } = renderHook(() => useExtensionState())
    // Drive the state subscription with a message lacking welcomeViewCompleted
    // (no public setter — assert via the reducer/handler directly if exported,
    // otherwise cover through a simulated subscription message in the harness).
    expect(result.current.showWelcome).toBe(false)
  })
})
```
If the context has no test harness for pushing subscription messages, add the assertion to the context's existing test file that already drives the subscription, keeping the assertion `showWelcome === false` when a message omits `welcomeViewCompleted`.

- [ ] **Step 2: Run test to verify it fails (if a harness exists)**

Run: `cd apps/vscode/webview-ui && bun test src/context --run`
Expected: FAIL if the current code flips `showWelcome` on a missing field.

- [ ] **Step 3: Tighten the flip condition**

In `ExtensionStateContext.tsx` (~line 485), change:
```tsx
if (!newState.welcomeViewCompleted && !showWelcome) {
```
to:
```tsx
if (newState.welcomeViewCompleted === false && !showWelcome) {
```
Keep the `else if (newState.welcomeViewCompleted)` branch unchanged (it already resets `showWelcome` to false when the field is truthy).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/vscode/webview-ui && bun test src/context --run`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

Run: `cd apps/vscode && bun run check-types`
Expected: no errors.
```bash
git add apps/vscode/webview-ui/src/context/ExtensionStateContext.tsx apps/vscode/webview-ui/src/context/__tests__/ExtensionStateContext.test.tsx
git commit -m "fix(webview): only show onboarding on explicit welcomeViewCompleted=false"
```

---

## Self-Review

- **Spec coverage:** Item 1 → Tasks 1–2 (backend RPC, webview card, browser download). Item 2 → Task 3 (projectLevel flag, wizard sets it, test). Item 3 → Tasks 4–5 (backend try/catch fallback + webview strict-equals guard + error logging). All spec requirements covered.
- **Placeholder scan:** No TBD/TODO; every code step has full code. The webview context test (Task 5 Step 1) is the one soft spot — the existing test harness shape is unknown, so the step gives the assertion and a fallback (add to the existing subscription-driving test) rather than a fabricated harness.
- **Type consistency:** `listDocuments(serverUrl, project)` matches across controller→facade→client. `addStdioServer(..., projectLevel?)` and `resolveMcpWriteFilePath(serverName?, projectLevel?)` consistent across Task 3 steps. Proto field `project_level` ↔ TS `projectLevel` consistent with existing `cellockai_preset` ↔ `cellockaiPreset` convention. `DocumentInfo` field names match the live API (`source`, `bytes`, `page_count`→`pageCount`, `content_hash`→`contentHash`, `url`).
