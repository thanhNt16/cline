# Docindex Project-Level Config + Agent Auto-Scoped Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist docindex MCP config (server URL + selected project name) at project level under `<workspace>/.cellockai/`, and auto-supply the persisted project name to the agent's docindex MCP `search` calls.

**Architecture:** Global base + workspace override storage (workspace wins per key), mirroring the existing `profiles` layering. The `vessel-indexer` MCP server is renamed to `docindex` and registered at workspace scope. The agent receives the project via a `callTool` arg-default in `McpHub` (only fills when the model omits `project`).

**Tech Stack:** TypeScript (Bun runtime), VS Code extension, bun:test + vitest, biome.

## Global Constraints

- Fork convention: global dir `~/.cellockai/`, workspace dir `<workspace>/.cellockai/`. Match tabs + double quotes + biome style.
- Code style: tabs, double quotes, no unused imports. Run `cd apps/vscode && bun run check-types` and `bun run lint` before finishing any task.
- **Do NOT commit.** Leave changes uncommitted (the crash-fix changeset on this branch is also uncommitted; the user commits explicitly).
- **Do NOT mutate the user's real `~/.cellockai/` files from tests.** All cleanup/path logic must route through mockable surfaces (`mcpHub.resolveMcpWriteFilePath`, mocked `@core/storage/disk`), never call `getGlobalMcpSettingsFilePath()` directly in a code path a unit test exercises without mocking.

---

## File Structure

- `src/core/storage/disk.ts` — add `getProjectDocsIndexSettingsFilePath()` (sibling of the global helper).
- `src/services/docs-index/DocsIndexSettingsService.ts` — refactor to merge global+workspace on read; write to workspace file.
- `src/services/docs-index/__tests__/DocsIndexSettingsService.test.ts` — extend mock + add merge tests.
- `src/services/docs-index/constants.ts` — rename `MCP_SERVER_KEY` to `"docindex"`.
- `src/services/docs-index/McpRegistrationService.ts` — write to workspace (`projectLevel: true`); add legacy-name cleanup.
- `src/services/docs-index/__tests__/McpRegistrationService.test.ts` — rewrite hub mock + assertions for workspace write + legacy cleanup.
- `src/services/docs-index/__tests__/McpRegistrationService.global.test.ts` — rewrite for workspace-default behavior + `docindex` name.
- `src/services/mcp/McpHub.ts` — add optional `docIndexProjectResolver` + setter; inject `project` in `callTool`.
- `src/services/mcp/__tests__/McpHub.callTool.test.ts` — add injection tests.
- `src/sdk/SdkController.ts` — wire the resolver after `DocsIndexFacade` construction.

No webview changes.

---

## Task 1: Storage layer — workspace `docs_index.json` + global/workspace merge

**Files:**
- Modify: `src/core/storage/disk.ts` (add helper near L330)
- Modify: `src/services/docs-index/DocsIndexSettingsService.ts` (full rewrite of the class body)
- Test: `src/services/docs-index/__tests__/DocsIndexSettingsService.test.ts`

**Interfaces:**
- Produces: `getProjectDocsIndexSettingsFilePath(): Promise<string>` in disk.ts. `DocsIndexSettingsService.get(): Promise<DocsIndexSettings>` (signature unchanged — still no args) now MERGES global+workspace.

- [ ] **Step 1: Add the workspace path helper in `disk.ts`**

Insert immediately after `getGlobalDocsIndexSettingsFilePath` (after line 330):

```ts
/**
 * CellockAI: <primaryWorkspaceRoot>/.cellockai/docs_index.json — the project-scoped
 * docindex settings override. Falls back to the global path (same as
 * getGlobalDocsIndexSettingsFilePath) when no workspace folder is open, so the
 * service degrades to the pre-project-scoping single-file behavior.
 */
export async function getProjectDocsIndexSettingsFilePath(): Promise<string> {
	return path.join(await getProjectSettingsDirectoryPath(), "docs_index.json")
}
```

- [ ] **Step 2: Rewrite `DocsIndexSettingsService.ts` class body**

Replace the entire `DocsIndexSettingsService` class (lines 29-63) with:

```ts
export class DocsIndexSettingsService {
	/**
	 * CellockAI: project-scoped docindex config. Reads MERGE the global
	 * ~/.cellockai/docs_index.json (base) with <workspace>/.cellockai/docs_index.json
	 * (override — workspace wins per key). Writes go to the workspace file so each
	 * project carries its own serverUrl + selected project. When no workspace is
	 * open, getProjectDocsIndexSettingsFilePath() falls back to the global path,
	 * preserving the original single-file behavior.
	 */
	async get(): Promise<DocsIndexSettings> {
		const globalRaw = await readJsonConfigFile<Partial<DocsIndexSettings>>(getGlobalDocsIndexSettingsFilePath())
		const serverUrl = typeof globalRaw?.serverUrl === "string" ? globalRaw.serverUrl : DEFAULTS.serverUrl
		const lastProjects =
			globalRaw?.lastProjects && typeof globalRaw.lastProjects === "object" ? { ...globalRaw.lastProjects } : {}

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
				}
			}
		}
		return { serverUrl, lastProjects }
	}

	async update(patch: Partial<DocsIndexSettings>): Promise<DocsIndexSettings> {
		if (patch.serverUrl !== undefined && !isValidServerUrl(patch.serverUrl)) {
			throw new Error(`Invalid server URL: ${patch.serverUrl}`)
		}
		const globalPath = getGlobalDocsIndexSettingsFilePath()
		const wsPath = await getProjectDocsIndexSettingsFilePath()
		if (wsPath !== globalPath) {
			// Project-scoped write: merge the patch onto the WORKSPACE file only,
			// so the workspace file holds just this project's keys and never shadows
			// the global file's other-workspace entries with stale copies.
			const wsRaw = await readJsonConfigFile<Partial<DocsIndexSettings>>(wsPath)
			const next: DocsIndexSettings = {
				serverUrl:
					patch.serverUrl != null
						? patch.serverUrl
						: typeof wsRaw?.serverUrl === "string"
							? wsRaw.serverUrl
							: DEFAULTS.serverUrl,
				lastProjects: { ...(wsRaw?.lastProjects ?? {}), ...(patch.lastProjects ?? {}) },
			}
			await writeJsonConfigFileAtomic(wsPath, next)
		} else {
			// No workspace open → write the global file (original behavior).
			const current = await this.get()
			const next: DocsIndexSettings = {
				serverUrl: patch.serverUrl != null ? patch.serverUrl : current.serverUrl,
				lastProjects:
					patch.lastProjects != null ? { ...current.lastProjects, ...patch.lastProjects } : current.lastProjects,
			}
			await writeJsonConfigFileAtomic(globalPath, next)
		}
		return this.get()
	}

	async setServerUrl(url: string): Promise<DocsIndexSettings> {
		return this.update({ serverUrl: url })
	}

	async setSelectedProject(workspacePath: string, project: string): Promise<DocsIndexSettings> {
		return this.update({ lastProjects: { [workspacePath]: project } })
	}
}
```

Update the import at the top of the file (line 1) to include the new helper:

```ts
import {
	getGlobalDocsIndexSettingsFilePath,
	getProjectDocsIndexSettingsFilePath,
	writeJsonConfigFileAtomic,
} from "@core/storage/disk"
```

- [ ] **Step 3: Extend the test mock + add merge tests**

In `DocsIndexSettingsService.test.ts`, the `mock.module("@core/storage/disk", ...)` block (lines 9-17) must also provide `getProjectDocsIndexSettingsFilePath`. Replace that block with:

```ts
let workspacePath = ""

mock.module("@core/storage/disk", () => ({
	getGlobalDocsIndexSettingsFilePath: () => path.join(home, ".cellockai", "docs_index.json"),
	getProjectDocsIndexSettingsFilePath: async () =>
		workspacePath ? path.join(workspacePath, ".cellockai", "docs_index.json") : path.join(home, ".cellockai", "docs_index.json"),
	writeJsonConfigFileAtomic: async <T>(filePath: string, data: T) => {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`
		await fs.writeFile(tempPath, JSON.stringify(data, null, 2), { encoding: "utf8", flag: "wx" })
		await fs.rename(tempPath, filePath)
	},
}))
```

Add `workspacePath = ""` reset in `beforeEach` (after `home = ...`):

```ts
beforeEach(async () => {
	home = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-home-"))
	workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-ws-"))
})
```

Add a helper + new tests inside the `describe("DocsIndexSettingsService", ...)` block (after the "rejects an invalid server URL" test):

```ts
const wsFile = () => path.join(workspacePath, ".cellockai", "docs_index.json")
const globalFile = () => path.join(home, ".cellockai", "docs_index.json")

it("writes selected project to the workspace file, not the global file", async () => {
	await new DocsIndexSettingsService().setSelectedProject("/ws/here", "projA")
	const ws = JSON.parse(await fs.readFile(wsFile(), "utf8"))
	assert.equal(ws.lastProjects["/ws/here"], "projA")
	await assert.rejects(() => fs.access(globalFile()))
})

it("merges global base with workspace override (workspace wins per key)", async () => {
	// seed global
	await fs.mkdir(path.dirname(globalFile()), { recursive: true })
	await fs.writeFile(globalFile(), JSON.stringify({ serverUrl: "http://global:1", lastProjects: { "/other": "projOther" } }))
	// workspace override
	const svc = new DocsIndexSettingsService()
	await svc.setServerUrl("http://workspace:2")
	await svc.setSelectedProject("/ws/here", "projHere")

	const settings = await svc.get()
	assert.equal(settings.serverUrl, "http://workspace:2") // workspace wins
	assert.equal(settings.lastProjects["/ws/here"], "projHere") // workspace entry
	assert.equal(settings.lastProjects["/other"], "projOther") // global base preserved
})

it("falls back to global when no workspace file exists", async () => {
	await fs.mkdir(path.dirname(globalFile()), { recursive: true })
	await fs.writeFile(globalFile(), JSON.stringify({ serverUrl: "http://global:1", lastProjects: { "/x": "p" } }))
	// point workspacePath at a fresh empty dir (no workspace file written)
	workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-ws2-"))
	const settings = await new DocsIndexSettingsService().get()
	assert.equal(settings.serverUrl, "http://global:1")
	assert.equal(settings.lastProjects["/x"], "p")
})
```

- [ ] **Step 4: Run the targeted test**

Run: `cd apps/vscode && bun run test:vitest -- DocsIndexSettingsService 2>/dev/null || bun src/services/docs-index/__tests__/DocsIndexSettingsService.test.ts`
Expected: all DocsIndexSettingsService + selectProject + isValidServerUrl tests PASS (existing + 3 new). If the bun filter doesn't isolate, run `bun scripts/run-bun-unit-tests.ts` and confirm this file's tests pass (pre-existing unrelated failures are out of scope).

- [ ] **Step 5: Do NOT commit.** Leave changes in the working tree.

---

## Task 2: Rename MCP server to `docindex` + project-scoped registration + legacy cleanup

**Files:**
- Modify: `src/services/docs-index/constants.ts:3`
- Modify: `src/services/docs-index/McpRegistrationService.ts` (full rewrite)
- Test: `src/services/docs-index/__tests__/McpRegistrationService.test.ts` (rewrite)
- Test: `src/services/docs-index/__tests__/McpRegistrationService.global.test.ts` (rewrite)

**Interfaces:**
- Produces: `MCP_SERVER_KEY === "docindex"`. `McpRegistrationService.register/unregister/isRegistered` now target `resolveMcpWriteFilePath(MCP_SERVER_KEY, /*projectLevel*/ true)` (workspace file). New private `removeLegacyEntries()` cleans `vessel-indexer` + `server-docs-index` from both global and workspace files via the hub.
- Consumes: `mcpHub.resolveMcpWriteFilePath(name?, projectLevel?)` (already exists, McpHub.ts:211).

- [ ] **Step 1: Rename the constant**

In `constants.ts` line 3:

```ts
export const MCP_SERVER_KEY = "docindex"
```

- [ ] **Step 2: Rewrite `McpRegistrationService.ts`**

Replace the entire file content with:

```ts
import type { McpHub } from "@services/mcp/McpHub"
import { updateMcpSettingsFile } from "@services/mcp/settingsLock"
import { Logger } from "@/shared/services/Logger"
import { MCP_SERVER_KEY } from "./constants"

// The docindex MCP server was previously registered under these names. They are
// removed from every writable settings file on register() so a rename doesn't
// leave a duplicate connection to the same URL.
const LEGACY_MCP_KEYS = ["vessel-indexer", "server-docs-index"]

export class McpRegistrationService {
	constructor(private readonly mcpHub: McpHub) {}

	async isRegistered(serverUrl: string): Promise<boolean> {
		const settingsPath = await this.mcpHub.resolveMcpWriteFilePath(MCP_SERVER_KEY, true)
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
		const settingsPath = await this.mcpHub.resolveMcpWriteFilePath(MCP_SERVER_KEY, true)
		const mcpUrl = `${serverUrl}/mcp`
		Logger.log(`[DocsIndex] register: writing to ${settingsPath} url=${mcpUrl}`)
		await this.removeLegacyEntries()
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
		const settingsPath = await this.mcpHub.resolveMcpWriteFilePath(MCP_SERVER_KEY, true)
		Logger.log(`[DocsIndex] unregister: removing from ${settingsPath}`)
		await updateMcpSettingsFile(settingsPath, (settings) => {
			if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
				return
			}
			const servers = settings.mcpServers as Record<string, unknown>
			delete servers[MCP_SERVER_KEY]
		})
	}

	/**
	 * Remove legacy server names (vessel-indexer / server-docs-index) from both the
	 * global and workspace settings files. Paths are resolved through the hub so the
	 * logic is mockable and never touches the user's real home dir from unit tests.
	 */
	private async removeLegacyEntries(): Promise<void> {
		const paths = new Set<string>([
			await this.mcpHub.resolveMcpWriteFilePath(undefined), // global (no serverName → global)
			await this.mcpHub.resolveMcpWriteFilePath(MCP_SERVER_KEY, true), // workspace
		])
		for (const p of paths) {
			await updateMcpSettingsFile(p, (settings) => {
				if (!settings.mcpServers || typeof settings.mcpServers !== "object") return
				const servers = settings.mcpServers as Record<string, unknown>
				for (const legacy of LEGACY_MCP_KEYS) {
					delete servers[legacy]
				}
			}).catch((err) => Logger.error("[DocsIndex] legacy entry cleanup failed:", err))
		}
	}
}
```

- [ ] **Step 3: Rewrite the mock-based test `McpRegistrationService.test.ts`**

Replace the entire file with:

```ts
import { describe, expect, mock, test } from "bun:test"

// path → settings object, captured across all updateMcpSettingsFile calls
const writes: Map<string, Record<string, unknown>> = new Map()

mock.module("@services/mcp/settingsLock", () => ({
	updateMcpSettingsFile: mock(async (path: string, mutator: (settings: Record<string, unknown>) => void) => {
		const settings = writes.get(path) ?? { mcpServers: {} }
		writes.set(path, settings)
		mutator(settings)
	}),
}))

const { McpRegistrationService } = await import("../McpRegistrationService")
const { MCP_SERVER_KEY } = await import("../constants")

// Hub mock: projectLevel=true → workspace path, else global path.
const WS_PATH = "/tmp/test-ws.json"
const GLOBAL_PATH = "/tmp/test-global.json"
const fakeHub = {
	resolveMcpWriteFilePath: async (_name?: string, projectLevel?: boolean) => (projectLevel ? WS_PATH : GLOBAL_PATH),
}

describe("McpRegistrationService", () => {
	test("register writes the docindex entry to the workspace file", async () => {
		writes.clear()
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.register("http://localhost:20130")
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		expect(wsServers[MCP_SERVER_KEY]).toBeDefined()
		expect(wsServers[MCP_SERVER_KEY].type).toBe("streamableHttp")
		expect(wsServers[MCP_SERVER_KEY].url).toBe("http://localhost:20130/mcp")
		expect(wsServers[MCP_SERVER_KEY].disabled).toBe(false)
	})

	test("register removes legacy vessel-indexer / server-docs-index entries from both files", async () => {
		writes.clear()
		// seed legacy entries in both files
		writes.set(WS_PATH, { mcpServers: { "vessel-indexer": { url: "http://x/mcp" } } })
		writes.set(GLOBAL_PATH, { mcpServers: { "server-docs-index": { url: "http://x/mcp" } } })
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.register("http://localhost:20130")
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		const globalServers = (writes.get(GLOBAL_PATH) as any)?.mcpServers
		expect(wsServers["vessel-indexer"]).toBeUndefined()
		expect(globalServers["server-docs-index"]).toBeUndefined()
		expect(wsServers[MCP_SERVER_KEY]).toBeDefined()
	})

	test("unregister removes the docindex entry from the workspace file", async () => {
		writes.clear()
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.register("http://localhost:20130")
		await svc.unregister()
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		expect(wsServers[MCP_SERVER_KEY]).toBeUndefined()
	})
})
```

- [ ] **Step 4: Rewrite the real-fs test `McpRegistrationService.global.test.ts`**

Replace the entire file with (note: the fakeHub now honors `projectLevel`, so registration lands in the workspace file — rename intent is reflected in the describe block):

```ts
import { strict as assert } from "node:assert"
import { afterEach, beforeEach, describe, it } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { McpRegistrationService } from "../McpRegistrationService"

describe("McpRegistrationService writes to the workspace file", () => {
	let tempHome: string
	let tempWorkspace: string
	let globalPath: string
	let wsPath: string
	let realHome: string | undefined
	let svc: McpRegistrationService

	beforeEach(async () => {
		realHome = process.env.HOME
		tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-home-"))
		tempWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-ws-"))
		process.env.HOME = tempHome
		globalPath = path.join(tempHome, ".cellockai", "mcp_settings.json")
		wsPath = path.join(tempWorkspace, ".cellockai", "mcp_settings.json")
		const fakeHub = {
			getMcpSettingsFilePath: async () => wsPath,
			// projectLevel=true → workspace; otherwise global. Mirrors McpHub.resolveMcpWriteFilePath.
			resolveMcpWriteFilePath: async (_name?: string, projectLevel?: boolean) => (projectLevel ? wsPath : globalPath),
		}
		svc = new McpRegistrationService(fakeHub as any)
	})

	afterEach(async () => {
		if (realHome === undefined) delete process.env.HOME
		else process.env.HOME = realHome
		await fs.rm(tempHome, { recursive: true, force: true })
		await fs.rm(tempWorkspace, { recursive: true, force: true })
	})

	it("register writes the docindex entry to the workspace file", async () => {
		await svc.register("http://localhost:20130")
		const ws = JSON.parse(await fs.readFile(wsPath, "utf8"))
		assert.equal(ws.mcpServers["docindex"].url, "http://localhost:20130/mcp")
	})

	it("register removes a legacy vessel-indexer entry from the global file", async () => {
		// seed a legacy global entry
		await fs.mkdir(path.dirname(globalPath), { recursive: true })
		await fs.writeFile(
			globalPath,
			JSON.stringify({ mcpServers: { "vessel-indexer": { type: "streamableHttp", url: "http://old/mcp" } } }),
		)
		await svc.register("http://localhost:20130")
		const global = JSON.parse(await fs.readFile(globalPath, "utf8"))
		assert.ok(!global.mcpServers["vessel-indexer"], "legacy vessel-indexer must be removed")
		assert.equal(global.mcpServers["docindex"]?.url, undefined, "docindex must live in the workspace file, not global")
	})

	it("isRegistered reads the workspace file", async () => {
		await svc.register("http://localhost:20130")
		assert.equal(await svc.isRegistered("http://localhost:20130"), true)
	})

	it("unregister removes the entry from the workspace file", async () => {
		await svc.register("http://localhost:20130")
		await svc.unregister()
		const ws = JSON.parse(await fs.readFile(wsPath, "utf8"))
		assert.ok(!ws.mcpServers["docindex"])
	})
})
```

- [ ] **Step 5: Run the targeted tests**

Run: `cd apps/vscode && bun src/services/docs-index/__tests__/McpRegistrationService.test.ts && bun src/services/docs-index/__tests__/McpRegistrationService.global.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Do NOT commit.**

---

## Task 3: `callTool` arg-default injection + resolver wiring

**Files:**
- Modify: `src/services/mcp/McpHub.ts` (add field + setter near L86; inject in `callTool` ~L1971)
- Modify: `src/sdk/SdkController.ts` (wire resolver after L312)
- Test: `src/services/mcp/__tests__/McpHub.callTool.test.ts` (add describe block)

**Interfaces:**
- Produces: `McpHub.setDocIndexProjectResolver(resolver: () => Promise<string | undefined>): void`. In `callTool`, when `serverName === "docindex"` && `toolName === "search"` && resolver set && `toolArguments.project == null`, the resolver's value is injected.
- Consumes (SdkController): `DocsIndexSettingsService.get()` (Task 1) + `DocsIndexFacade.getWorkspacePath()`.

- [ ] **Step 1: Add the resolver field + setter in `McpHub.ts`**

Add to the class field list (after `private clientVersion: string` ~L86):

```ts
	/**
	 * CellockAI: optional resolver that returns the persisted docindex project name
	 * for the active workspace. When set, callTool() auto-fills the `project` arg
	 * of the docindex MCP `search` tool whenever the model omits it, so the agent
	 * doesn't have to re-specify the project each turn. Wired by SdkController.
	 */
	private docIndexProjectResolver?: () => Promise<string | undefined>

	setDocIndexProjectResolver(resolver: () => Promise<string | undefined>): void {
		this.docIndexProjectResolver = resolver
	}
```

- [ ] **Step 2: Inject the default in `callTool`**

In `McpHub.callTool` (~line 1971), insert IMMEDIATELY after the closing of the `if (!connection.client) { ... }` block and BEFORE `const timeout = resolveMcpServerTimeoutMs(...)`:

```ts
		// CellockAI: auto-default the docindex MCP `search` tool's `project` arg from
		// the persisted workspace setting, so the agent doesn't re-specify it each turn.
		// Only fills when the model omitted it; an explicit value always wins.
		if (serverName === "docindex" && toolName === "search" && this.docIndexProjectResolver) {
			const project = await this.docIndexProjectResolver()
			if (project && (!toolArguments || toolArguments.project == null)) {
				toolArguments = { ...(toolArguments ?? {}), project }
			}
		}
```

- [ ] **Step 3: Wire the resolver in `SdkController.ts`**

After line 312 (`this.docsIndex = new DocsIndexFacade(this.mcpHub)`), add:

```ts
		// CellockAI: auto-scope docindex `search` calls to the persisted workspace project.
		this.mcpHub.setDocIndexProjectResolver(async () => {
			const workspacePath = await this.docsIndex.getWorkspacePath()
			if (!workspacePath) return undefined
			const settings = await new DocsIndexSettingsService().get()
			return settings.lastProjects[workspacePath] || undefined
		})
```

Add the import near the existing docs-index import (after line 44):

```ts
import { DocsIndexSettingsService } from "@/services/docs-index/DocsIndexSettingsService"
```

- [ ] **Step 4: Add injection tests to `McpHub.callTool.test.ts`**

Append a new `describe` block at the end of the file (before the final closing `})` of `describe("McpHub.callTool", ...)`):

```ts
	// ── CellockAI: docindex project arg-default ─────────────────────────

	describe("docindex project arg-default", () => {
		it("injects project when the model omits it", async () => {
			const { hub, client } = createMcpHub({ serverName: "docindex" })
			;(hub as any).docIndexProjectResolver = async () => "my-project"

			await hub.callTool("docindex", "search", { query: "how to auth" }, "ulid-d1")

			const requestArgs = client.request.firstCall.args[0]
			requestArgs.params.arguments.should.deepEqual({ query: "how to auth", project: "my-project" })
		})

		it("injects project when toolArguments is undefined", async () => {
			const { hub, client } = createMcpHub({ serverName: "docindex" })
			;(hub as any).docIndexProjectResolver = async () => "my-project"

			await hub.callTool("docindex", "search", undefined, "ulid-d2")

			const requestArgs = client.request.firstCall.args[0]
			requestArgs.params.arguments.should.deepEqual({ project: "my-project" })
		})

		it("does NOT override an explicit project", async () => {
			const { hub, client } = createMcpHub({ serverName: "docindex" })
			;(hub as any).docIndexProjectResolver = async () => "my-project"

			await hub.callTool("docindex", "search", { project: "explicit", query: "x" }, "ulid-d3")

			const requestArgs = client.request.firstCall.args[0]
			requestArgs.params.arguments.should.deepEqual({ project: "explicit", query: "x" })
		})

		it("does not inject when no resolver is set", async () => {
			const { hub, client } = createMcpHub({ serverName: "docindex" })

			await hub.callTool("docindex", "search", { query: "x" }, "ulid-d4")

			const requestArgs = client.request.firstCall.args[0]
			requestArgs.params.arguments.should.deepEqual({ query: "x" })
		})

		it("does not inject for non-docindex servers", async () => {
			const { hub, client } = createMcpHub({ serverName: "other-server" })
			;(hub as any).docIndexProjectResolver = async () => "my-project"

			await hub.callTool("other-server", "search", { query: "x" }, "ulid-d5")

			const requestArgs = client.request.firstCall.args[0]
			requestArgs.params.arguments.should.deepEqual({ query: "x" })
		})

		it("does not inject when resolver returns undefined", async () => {
			const { hub, client } = createMcpHub({ serverName: "docindex" })
			;(hub as any).docIndexProjectResolver = async () => undefined

			await hub.callTool("docindex", "search", { query: "x" }, "ulid-d6")

			const requestArgs = client.request.firstCall.args[0]
			requestArgs.params.arguments.should.deepEqual({ query: "x" })
		})
	})
```

- [ ] **Step 5: Run the targeted test**

Run: `cd apps/vscode && bun src/services/mcp/__tests__/McpHub.callTool.test.ts`
Expected: all existing callTool tests + 6 new injection tests PASS.

- [ ] **Step 6: Do NOT commit.**

---

## Task 4: Full verification (run by the coordinating agent after Tasks 1-3)

- [ ] **Step 1: Type-check**

Run: `cd apps/vscode && bun run check-types`
Expected: EXIT 0. Fix any new errors (likely none — interfaces are unchanged on the consuming side).

- [ ] **Step 2: Lint + format**

Run: `cd apps/vscode && bun run lint`
Expected: EXIT 0 (biome + proto-lint). If biome reports formatting, run `bunx biome format --config-path ./biome.jsonc --write <changed files>` and re-lint.

- [ ] **Step 3: Affected unit tests**

Run:
```
cd apps/vscode && bun src/services/docs-index/__tests__/DocsIndexSettingsService.test.ts && bun src/services/docs-index/__tests__/McpRegistrationService.test.ts && bun src/services/docs-index/__tests__/McpRegistrationService.global.test.ts && bun src/services/mcp/__tests__/McpHub.callTool.test.ts
```
Expected: all PASS.

- [ ] **Step 4: Webview suite sanity** (no webview changes, but confirm nothing broke)

Run: `cd apps/vscode/webview-ui && bun run test`
Expected: 465/465 PASS (unchanged).

- [ ] **Step 5: Manual verification (user)**

1. Open a workspace, open the Document Index tab, set a server URL + select a project.
2. Confirm `<workspace>/.cellockai/docs_index.json` and `<workspace>/.cellockai/mcp_settings.json` are created (the latter with a `docindex` entry), and `~/.cellockai/` is NOT modified for these.
3. Confirm any prior `vessel-indexer` / `server-docs-index` entry in `~/.cellockai/cline_mcp_settings.json` is removed.
4. In an agent turn, ask the model to search the doc index WITHOUT specifying a project. Confirm the call uses the persisted project (check the MCP tool call args in the host log / DevTools).
5. Ask the model to search WITH an explicit project. Confirm the explicit value wins.

---

## Self-Review

**Spec coverage:**
- §1 Storage (global base + workspace override, write to workspace) → Task 1. ✓
- §2 MCP rename `docindex` + project-scoped registration + legacy cleanup → Task 2. ✓
- §3 callTool arg-default + injected resolver wiring → Task 3. ✓
- §4 UI no change → no task (explicitly none). ✓
- §5 Migration (global stays as base; legacy names cleaned) → Task 2 Step 2 (`removeLegacyEntries`). ✓
- §6 Testing → embedded in Tasks 1-3 + Task 4. ✓

**Placeholder scan:** None — every step has actual code. ✓

**Type consistency:** `MCP_SERVER_KEY` = `"docindex"` used identically in constants, McpRegistrationService, McpHub (`serverName === "docindex"`), and tests. `getProjectDocsIndexSettingsFilePath` signature matches between disk.ts (producer) and DocsIndexSettingsService (consumer). `setDocIndexProjectResolver` signature matches between McpHub (producer) and SdkController (consumer). `DocsIndexSettingsService.get()` remains `() => Promise<DocsIndexSettings>` — SdkController calls it with no args. ✓

**Ambiguity check:** The `serverName === "docindex"` literal in McpHub duplicates `MCP_SERVER_KEY`; this is deliberate to avoid `McpHub` importing from the docs-index layer (documented in the step comment). The workspace-vs-global branch in `DocsIndexSettingsService.update` keys off `wsPath !== globalPath`, which is true exactly when a workspace folder is open (the helper falls back to the global path otherwise) — unambiguous. ✓
