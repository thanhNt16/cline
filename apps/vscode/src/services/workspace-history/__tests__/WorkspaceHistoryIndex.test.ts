import { afterEach, describe, expect, mock, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { tmpdir } from "node:os"

const mockGetProjectSettingsDirectoryPath = mock(async () => "")

mock.module("@core/storage/disk", () => ({
	getProjectSettingsDirectoryPath: mockGetProjectSettingsDirectoryPath,
}))

const { belongsToWorkspace, WorkspaceHistoryIndex } = await import("../WorkspaceHistoryIndex")

describe("belongsToWorkspace", () => {
	test("uses only the project-owned session index", () => {
		const indexed = new Set(["indexed"])
		expect(belongsToWorkspace({ id: "indexed" }, indexed)).toBe(true)
		expect(
			belongsToWorkspace(
				{ id: "legacy", cwdOnTaskInitialization: "/repo/a" },
				indexed,
			),
		).toBe(false)
		expect(belongsToWorkspace({ id: "unknown" }, new Set())).toBe(false)
	})
})

describe("WorkspaceHistoryIndex", () => {
	let tempDir: string
	let cleanup: () => Promise<void>

	afterEach(async () => {
		if (cleanup) await cleanup()
	})

	async function setupWorkspace(): Promise<void> {
		const dir = await fs.mkdtemp(path.join(tmpdir(), "ws-hist-test-"))
		tempDir = dir
		cleanup = async () => {
			await fs.rm(dir, { recursive: true, force: true })
		}
		mockGetProjectSettingsDirectoryPath.mockImplementation(async () => path.join(dir, ".cellockai"))
	}

	test("addTaskId writes to .cellockai/sessions/history.json", async () => {
		await setupWorkspace()
		const index = new WorkspaceHistoryIndex()
		await index.addTaskId("task-001")
		const filePath = path.join(tempDir, ".cellockai", "sessions", "history.json")
		const content = JSON.parse(await fs.readFile(filePath, "utf8"))
		expect(content.taskIds).toContain("task-001")
	})

	test("getTaskIds returns set of task IDs from disk", async () => {
		await setupWorkspace()
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
		await setupWorkspace()
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
		await setupWorkspace()
		const index = new WorkspaceHistoryIndex()
		await index.addTaskId("task-001")
		expect(await index.containsTaskId("task-001")).toBe(true)
		expect(await index.containsTaskId("task-999")).toBe(false)
	})

	test("removeTaskIds removes only requested IDs", async () => {
		await setupWorkspace()
		const index = new WorkspaceHistoryIndex()
		await index.addTaskId("task-001")
		await index.addTaskId("task-002")
		await index.removeTaskIds(new Set(["task-001"]))
		expect(await index.getTaskIds()).toEqual(new Set(["task-002"]))
	})

	test("getTaskIds returns empty set when file does not exist", async () => {
		await setupWorkspace()
		const index = new WorkspaceHistoryIndex()
		const ids = await index.getTaskIds()
		expect(ids.size).toBe(0)
	})

	test("addTaskId is idempotent", async () => {
		await setupWorkspace()
		const index = new WorkspaceHistoryIndex()
		await index.addTaskId("task-001")
		await index.addTaskId("task-001")
		await index.invalidateCache()
		const ids = await index.getTaskIds()
		expect(ids.size).toBe(1)
	})
})
