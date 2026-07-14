# Workspace-Isolated Session History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate session/task history per workspace by storing a workspace-specific history index at `.cellockai/sessions/history.json`, so switching workspace directories shows different history.

**Architecture:** A new `WorkspaceHistoryIndex` class manages `.cellockai/sessions/history.json` — a lightweight index of task IDs belonging to this workspace. Session message storage stays in the existing global SDK storage (ClineCore). History loading filters by the workspace index; task creation adds to it; task deletion removes from it. The UI defaults to workspace-only view.

**Tech Stack:** TypeScript, Node.js fs, VSCode Extension API, bun:test

## Global Constraints

- Do not change internal identifiers (`ClineProvider`, proto services, `@cline/*` imports, storage keys)
- Base directory for all commands: `apps/vscode/`
- Typecheck: `npm run check-types` | Unit tests: `npm run test:unit` | Proto: `npm run protos`
- `SdkController` constructor is NOT async — use synchronous initialization
- Follow existing biome formatting (tabs, double quotes for biome)
- The extension backend uses `@shared/` for `src/shared/`, `@services/` for `src/services/`, `@/` for `src/`
- `bun:test` imports required for unit tests (not mocha)
- Session message storage stays in global SDK storage (ClineCore) — only the history INDEX moves to `.cellockai/`
- The workspace index file is `.cellockai/sessions/history.json` (NOT in global storage)
- If no workspace is open, fall back to global history (no filtering)
- Do not modify the SDK (`@cline/core`) — work within the extension layer only

---

## File Structure

### New Files
- `apps/vscode/src/services/workspace-history/WorkspaceHistoryIndex.ts` — manages `.cellockai/sessions/history.json`
- `apps/vscode/src/services/workspace-history/__tests__/WorkspaceHistoryIndex.test.ts` — unit tests

### Modified Files
- `apps/vscode/src/sdk/SdkController.ts` — instantiate `WorkspaceHistoryIndex`, wire into task creation/deletion, filter `getTaskHistory()`, filter `getStateToPostToWebview()`
- `apps/vscode/src/sdk/sdk-task-start-coordinator.ts` — call `workspaceHistoryIndex.addTaskId()` after task creation
- `apps/vscode/src/core/controller/state/getStateToPostToWebview.ts` — filter top-100 by workspace
- `apps/vscode/webview-ui/src/components/history/HistoryView.tsx` — default `showCurrentWorkspaceOnly` to `true`

---

### Task 1: WorkspaceHistoryIndex Service

**Files:**
- Create: `apps/vscode/src/services/workspace-history/WorkspaceHistoryIndex.ts`
- Test: `apps/vscode/src/services/workspace-history/__tests__/WorkspaceHistoryIndex.test.ts`

**Interfaces:**
- Consumes: `getProjectSettingsDirectoryPath()` from `@core/storage/disk` (returns `<workspace>/.cellockai`)
- Produces: `WorkspaceHistoryIndex` class with methods:
  - `getTaskIds(): Promise<Set<string>>` — returns set of task IDs for current workspace
  - `addTaskId(taskId: string): Promise<void>` — adds a task ID to the workspace index
  - `removeTaskId(taskId: string): Promise<void>` — removes a task ID from the workspace index
  - `containsTaskId(taskId: string): Promise<boolean>` — checks if a task ID is in the workspace index
  - `invalidateCache(): void` — clears in-memory cache so next read hits disk

- [ ] **Step 1: Write the failing test**

Create `apps/vscode/src/services/workspace-history/__tests__/WorkspaceHistoryIndex.test.ts`:

```typescript
import { afterEach, describe, expect, mock, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { tmpdir } from "node:os"

mock.module("@core/storage/disk", () => ({
	getProjectSettingsDirectoryPath: mock(async () => ""),
}))

const { WorkspaceHistoryIndex } = await import("../WorkspaceHistoryIndex")

async function makeTempWorkspace(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
	const dir = await fs.mkdtemp(path.join(tmpdir(), "ws-hist-test-"))
	const cellockaiDir = path.join(dir, ".cellockai", "sessions")
	await fs.mkdir(cellockaiDir, { recursive: true })
	const getProjectSettingsDirectoryPath = async () => path.join(dir, ".cellockai")
	// Patch the mock to return this workspace's .cellockai dir
	const diskModule = await import("@core/storage/disk")
	;(diskModule as any).getProjectSettingsDirectoryPath = getProjectSettingsDirectoryPath
	return {
		dir,
		cleanup: async () => {
			await fs.rm(dir, { recursive: true, force: true })
		},
	}
}

describe("WorkspaceHistoryIndex", () => {
	let tempDir: string
	let cleanup: () => Promise<void>

	afterEach(async () => {
		if (cleanup) await cleanup()
	})

	test("addTaskId writes to .cellockai/sessions/history.json", async () => {
		;({ dir: tempDir, cleanup } = await makeTempWorkspace())
		const index = new WorkspaceHistoryIndex()
		await index.addTaskId("task-001")
		const filePath = path.join(tempDir, ".cellockai", "sessions", "history.json")
		const content = JSON.parse(await fs.readFile(filePath, "utf8"))
		expect(content.taskIds).toContain("task-001")
	})

	test("getTaskIds returns set of task IDs from disk", async () => {
		;({ dir: tempDir, cleanup } = await makeTempWorkspace())
		const index = new WorkspaceHistoryIndex()
		await index.addTaskId("task-001")
		await index.addTaskId("task-002")
		await index.invalidateCache()
		const ids = await index.getTaskIds()
		expect(ids.size).toBe(2)
		expect(ids.has("task-001")).toBe(true)
		expect(ids.has("task-002")).toBe(true)
	})

	test("removeTaskId removes from index", async () => {
		;({ dir: tempDir, cleanup } = await makeTempWorkspace())
		const index = new WorkspaceHistoryIndex()
		await index.addTaskId("task-001")
		await index.addTaskId("task-002")
		await index.removeTaskId("task-001")
		await index.invalidateCache()
		const ids = await index.getTaskIds()
		expect(ids.size).toBe(1)
		expect(ids.has("task-002")).toBe(true)
	})

	test("containsTaskId checks membership", async () => {
		;({ dir: tempDir, cleanup } = await makeTempWorkspace())
		const index = new WorkspaceHistoryIndex()
		await index.addTaskId("task-001")
		expect(await index.containsTaskId("task-001")).toBe(true)
		expect(await index.containsTaskId("task-999")).toBe(false)
	})

	test("getTaskIds returns empty set when file does not exist", async () => {
		;({ dir: tempDir, cleanup } = await makeTempWorkspace())
		const index = new WorkspaceHistoryIndex()
		const ids = await index.getTaskIds()
		expect(ids.size).toBe(0)
	})

	test("addTaskId is idempotent", async () => {
		;({ dir: tempDir, cleanup } = await makeTempWorkspace())
		const index = new WorkspaceHistoryIndex()
		await index.addTaskId("task-001")
		await index.addTaskId("task-001")
		await index.invalidateCache()
		const ids = await index.getTaskIds()
		expect(ids.size).toBe(1)
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/vscode && npx bun test src/services/workspace-history/__tests__/WorkspaceHistoryIndex.test.ts`
Expected: FAIL — module `../WorkspaceHistoryIndex` not found

- [ ] **Step 3: Write minimal implementation**

Create `apps/vscode/src/services/workspace-history/WorkspaceHistoryIndex.ts`:

```typescript
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { getProjectSettingsDirectoryPath } from "@core/storage/disk"
import { Logger } from "@/shared/services/Logger"

interface WorkspaceHistoryFile {
	taskIds: string[]
}

export class WorkspaceHistoryIndex {
	private cachedTaskIds: Set<string> | null = null
	private cacheValid = false

	private async getHistoryFilePath(): Promise<string> {
		const settingsDir = await getProjectSettingsDirectoryPath()
		const sessionsDir = path.join(settingsDir, "sessions")
		await fs.mkdir(sessionsDir, { recursive: true })
		return path.join(sessionsDir, "history.json")
	}

	private async readIndex(): Promise<Set<string>> {
		if (this.cacheValid && this.cachedTaskIds) {
			return this.cachedTaskIds
		}
		try {
			const filePath = await this.getHistoryFilePath()
			const content = await fs.readFile(filePath, "utf8")
			const parsed = JSON.parse(content) as WorkspaceHistoryFile
			this.cachedTaskIds = new Set(parsed.taskIds || [])
		} catch {
			this.cachedTaskIds = new Set()
		}
		this.cacheValid = true
		return this.cachedTaskIds
	}

	private async writeIndex(ids: Set<string>): Promise<void> {
		const filePath = await this.getHistoryFilePath()
		const data: WorkspaceHistoryFile = { taskIds: Array.from(ids) }
		await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
		this.cachedTaskIds = ids
		this.cacheValid = true
	}

	async getTaskIds(): Promise<Set<string>> {
		return await this.readIndex()
	}

	async addTaskId(taskId: string): Promise<void> {
		try {
			const ids = await this.readIndex()
			if (ids.has(taskId)) return
			ids.add(taskId)
			await this.writeIndex(ids)
		} catch (error) {
			Logger.error("[WorkspaceHistoryIndex] Failed to add task ID:", error)
		}
	}

	async removeTaskId(taskId: string): Promise<void> {
		try {
			const ids = await this.readIndex()
			if (!ids.has(taskId)) return
			ids.delete(taskId)
			await this.writeIndex(ids)
		} catch (error) {
			Logger.error("[WorkspaceHistoryIndex] Failed to remove task ID:", error)
		}
	}

	async containsTaskId(taskId: string): Promise<boolean> {
		const ids = await this.readIndex()
		return ids.has(taskId)
	}

	invalidateCache(): void {
		this.cachedTaskIds = null
		this.cacheValid = false
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/vscode && npx bun test src/services/workspace-history/__tests__/WorkspaceHistoryIndex.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/vscode/src/services/workspace-history/WorkspaceHistoryIndex.ts apps/vscode/src/services/workspace-history/__tests__/WorkspaceHistoryIndex.test.ts
git commit -m "feat: add WorkspaceHistoryIndex for .cellockai/sessions/history.json"
```

---

### Task 2: Wire WorkspaceHistoryIndex into SdkController

**Files:**
- Modify: `apps/vscode/src/sdk/SdkController.ts` (field, constructor, dispose, getTaskHistory, getStateToPostToWebview)
- Modify: `apps/vscode/src/sdk/sdk-task-start-coordinator.ts` (add task ID to workspace index after creation)

**Interfaces:**
- Consumes: `WorkspaceHistoryIndex` from Task 1
- Produces: `controller.workspaceHistoryIndex: WorkspaceHistoryIndex` field
- Produces: `getTaskHistory()` now filters by workspace index when `currentWorkspaceOnly` is true
- Produces: `getStateToPostToWebview()` now filters top-100 by workspace index

- [ ] **Step 1: Add field and construction to SdkController**

In `apps/vscode/src/sdk/SdkController.ts`:

1. Add import after the `DocsIndexFacade` import (around line 44):

```typescript
import { WorkspaceHistoryIndex } from "@/services/workspace-history/WorkspaceHistoryIndex"
```

2. Add field after `docsIndex: DocsIndexFacade` (around line 192):

```typescript
	workspaceHistoryIndex: WorkspaceHistoryIndex
```

3. Add construction after `this.docsIndex = new DocsIndexFacade(this.mcpHub)` (around line 278):

```typescript
		this.workspaceHistoryIndex = new WorkspaceHistoryIndex()
```

4. In the workspace folder change handler (around line 262-269, where `vscode.workspace.onDidChangeWorkspaceFolders` is wired), add after `this.mcpHub?.rewatchMcpSettingsFile()`:

```typescript
			this.workspaceHistoryIndex?.invalidateCache()
```

- [ ] **Step 2: Filter getTaskHistory by workspace index**

In `apps/vscode/src/sdk/SdkController.ts`, in the `getTaskHistory` method (around line 1573), replace the existing `currentWorkspaceOnly` filter block:

Change from:
```typescript
			if (currentWorkspaceOnly && workspacePath) {
				const sessionWorkspacePath = item.cwd ?? item.workspaceRoot
				if (!sessionWorkspacePath || !arePathsEqual(sessionWorkspacePath, workspacePath)) {
					return false
				}
			}
```

To:
```typescript
			if (currentWorkspaceOnly && workspacePath) {
				// First check the workspace history index (.cellockai/sessions/history.json)
				// Falls back to cwd comparison for legacy/SDK tasks not yet in the index
				const inIndex = await this.workspaceHistoryIndex.containsTaskId(item.sessionId)
				if (!inIndex) {
					const sessionWorkspacePath = item.cwd ?? item.workspaceRoot
					if (!sessionWorkspacePath || !arePathsEqual(sessionWorkspacePath, workspacePath)) {
						return false
					}
				}
			}
```

Note: The filter callback now needs to be `async`. Since `filter` doesn't support async, change the filtering approach to use a `for` loop with `await`:

Replace the entire `let filteredTasks = sessionHistory.filter((item) => {` block (around lines 1559-1581) with:

```typescript
		const workspaceTaskIds = currentWorkspaceOnly && workspacePath ? await this.workspaceHistoryIndex.getTaskIds() : null

		const filteredTasks: typeof sessionHistory = []
		for (const item of sessionHistory) {
			const ts = dateStringToTimestamp(item.updatedAt ?? item.endedAt ?? item.startedAt)
			const task = metadataString(item.metadata, "title") ?? item.prompt ?? ""

			if (!ts || !task) {
				continue
			}

			const isFavorited =
				metadataBoolean(item.metadata, "isFavorited") ?? metadataBoolean(item.metadata, "is_favorited") ?? false
			if (favoritesOnly && !isFavorited) {
				continue
			}

			if (currentWorkspaceOnly && workspacePath) {
				const inIndex = workspaceTaskIds?.has(item.sessionId) ?? false
				if (!inIndex) {
					const sessionWorkspacePath = item.cwd ?? item.workspaceRoot
					if (!sessionWorkspacePath || !arePathsEqual(sessionWorkspacePath, workspacePath)) {
						continue
					}
				}
			}

			filteredTasks.push(item)
		}
```

- [ ] **Step 3: Wire task creation to add to workspace index**

In `apps/vscode/src/sdk/sdk-task-start-coordinator.ts`, after the `updateTaskHistoryItem` call (around line 140), add:

```typescript
			await this.options.workspaceHistoryIndex.addTaskId(taskSessionId)
```

This requires adding `workspaceHistoryIndex` to the `SdkTaskStartCoordinatorOptions` interface. Find the interface definition (around line 40-50) and add:

```typescript
	workspaceHistoryIndex: { addTaskId: (taskId: string) => Promise<void> }
```

Then in `apps/vscode/src/sdk/SdkController.ts`, where the task start coordinator is constructed (search for `new SdkTaskStartCoordinator` or where the options are passed), add:

```typescript
			workspaceHistoryIndex: this.workspaceHistoryIndex,
```

- [ ] **Step 4: Wire task deletion to remove from workspace index**

In `apps/vscode/src/sdk/SdkController.ts`, in the `deleteTaskFromState` method (line 1682), add `removeTaskId` call:

Change from:
```typescript
	async deleteTaskFromState(id: string): Promise<HistoryItem[]> {
		return this.taskHistory.deleteTaskFromState(id)
	}
```

To:
```typescript
	async deleteTaskFromState(id: string): Promise<HistoryItem[]> {
		await this.workspaceHistoryIndex.removeTaskId(id)
		return this.taskHistory.deleteTaskFromState(id)
	}
```

Also in `deleteAllTaskHistory` (line 1686), after the deletion completes, invalidate the workspace index cache so the next history read doesn't return stale IDs. Find the line after `const tasksDeleted = await this.taskHistory.deleteAllTaskHistory(...)` (around line 1739) and add:

```typescript
		this.workspaceHistoryIndex.invalidateCache()
```

- [ ] **Step 5: Filter getStateToPostToWebview top-100 by workspace**

In `apps/vscode/src/core/controller/state/getStateToPostToWebview.ts`, the `processedTaskHistory` (around line 116) currently takes top 100 from global `taskHistory`. Add workspace filtering:

Change from:
```typescript
	const processedTaskHistory = (taskHistory || [])
		.filter((item: any) => item.ts && item.task)
		.sort((a: any, b: any) => b.ts - a.ts)
		.slice(0, 100)
```

To:
```typescript
	const workspaceTaskIds = controller.workspaceHistoryIndex
		? await controller.workspaceHistoryIndex.getTaskIds()
		: null

	const processedTaskHistory = (taskHistory || [])
		.filter((item: any) => item.ts && item.task)
		.filter((item: any) => {
			if (!workspaceTaskIds || workspaceTaskIds.size === 0) return true
			return workspaceTaskIds.has(item.id)
		})
		.sort((a: any, b: any) => b.ts - a.ts)
		.slice(0, 100)
```

Note: `getStateToPostToWebview` is already an `async` function, so `await` is fine.

- [ ] **Step 6: Run typecheck**

Run: `cd apps/vscode && npx tsc --noEmit`
Expected: PASS (0 errors). If there are errors about the `SdkTaskStartCoordinatorOptions` interface or missing imports, fix them.

- [ ] **Step 7: Commit**

```bash
git add apps/vscode/src/sdk/SdkController.ts apps/vscode/src/sdk/sdk-task-start-coordinator.ts apps/vscode/src/core/controller/state/getStateToPostToWebview.ts
git commit -m "feat: wire WorkspaceHistoryIndex into SdkController for workspace-isolated history"
```

---

### Task 3: Default Workspace-Only Filter in UI

**Files:**
- Modify: `apps/vscode/webview-ui/src/components/history/HistoryView.tsx:49`

**Interfaces:**
- Consumes: `showCurrentWorkspaceOnly` state in `HistoryView`
- Produces: Default workspace-only filtering in the history UI

- [ ] **Step 1: Change default to true**

In `apps/vscode/webview-ui/src/components/history/HistoryView.tsx`, line 49:

Change from:
```typescript
	const [showCurrentWorkspaceOnly, setShowCurrentWorkspaceOnly] = useState(false)
```

To:
```typescript
	const [showCurrentWorkspaceOnly, setShowCurrentWorkspaceOnly] = useState(true)
```

- [ ] **Step 2: Run webview typecheck**

Run: `cd apps/vscode/webview-ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/vscode/webview-ui/src/components/history/HistoryView.tsx
git commit -m "feat: default history view to workspace-only"
```

---

### Task 4: Workspace Change → Reload History

**Files:**
- Modify: `apps/vscode/src/sdk/SdkController.ts` (workspace change handler)

**Interfaces:**
- Consumes: `WorkspaceHistoryIndex.invalidateCache()` from Task 1
- Produces: History reload on workspace folder change

- [ ] **Step 1: Add cache invalidation + state refresh on workspace change**

In `apps/vscode/src/sdk/SdkController.ts`, find the workspace change handler (around line 262-269 where `vscode.workspace.onDidChangeWorkspaceFolders` is wired). After the `this.mcpHub?.rewatchMcpSettingsFile()` call (which was added in Task 2 Step 1), add a state refresh:

```typescript
			this.workspaceHistoryIndex?.invalidateCache()
			this.postStateToWebview().catch((err: unknown) =>
				Logger.error("[SdkController] Failed to post state after workspace change:", err),
			)
```

This ensures that when the user switches workspace folders:
1. The workspace history index cache is invalidated
2. The webview state is refreshed (which triggers `getStateToPostToWebview` to re-read the workspace index)
3. The history view shows the new workspace's history

- [ ] **Step 2: Run typecheck**

Run: `cd apps/vscode && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/vscode/src/sdk/SdkController.ts
git commit -m "feat: reload history on workspace folder change"
```

---

### Task 5: Full Build + Test

**Files:**
- No new files — verification only

- [ ] **Step 1: Run typecheck**

Run: `cd apps/vscode && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run webview typecheck**

Run: `cd apps/vscode/webview-ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run unit tests**

Run: `cd apps/vscode && npx bun test src/services/workspace-history/__tests__/WorkspaceHistoryIndex.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 4: Run lint**

Run: `cd apps/vscode && npx bun run lint`
Expected: PASS

- [ ] **Step 5: Run package build**

Run: `cd apps/vscode && npx bun run package`
Expected: PASS

- [ ] **Step 6: Manual smoke test**

Press F5 in VSCode to launch Extension Development Host. Then:

1. Open workspace A (e.g. `/Users/harry/Desktop/cline`)
2. Create a new task (type something, send it)
3. Check `.cellockai/sessions/history.json` exists and contains the task ID
4. Open history view → verify only tasks from workspace A are shown
5. Verify "Workspace Only" filter is ON by default
6. Open workspace B (a different folder)
7. Verify history view shows different (or empty) history
8. Switch back to workspace A → verify workspace A's history is back
9. Delete a task → verify it's removed from `.cellockai/sessions/history.json`

- [ ] **Step 7: Commit any remaining changes**

```bash
git status
git add -A
git commit -m "feat: complete workspace-isolated session history"
```
