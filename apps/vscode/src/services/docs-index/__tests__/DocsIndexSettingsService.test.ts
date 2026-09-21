import { afterEach, beforeEach, describe, it, mock } from "bun:test"
import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

let home = ""
let workspacePath = ""

mock.module("@core/storage/disk", () => ({
	getGlobalDocsIndexSettingsFilePath: () => path.join(home, ".cellockai", "docs_index.json"),
	getProjectDocsIndexSettingsFilePath: async () =>
		workspacePath
			? path.join(workspacePath, ".cellockai", "docs_index.json")
			: path.join(home, ".cellockai", "docs_index.json"),
	writeJsonConfigFileAtomic: async <T>(filePath: string, data: T) => {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`
		await fs.writeFile(tempPath, JSON.stringify(data, null, 2), { encoding: "utf8", flag: "wx" })
		await fs.rename(tempPath, filePath)
	},
}))

const { DocsIndexSettingsService, isValidServerUrl, selectProject } = await import("../DocsIndexSettingsService")

describe("DocsIndexSettingsService", () => {
	beforeEach(async () => {
		home = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-home-"))
		workspacePath = ""
	})

	afterEach(async () => {
		await fs.rm(home, { recursive: true, force: true })
	})

	const file = () => path.join(home, ".cellockai", "docs_index.json")

	it("returns defaults when file is absent", async () => {
		const settings = await new DocsIndexSettingsService().get()
		assert.equal(settings.serverUrl, "http://localhost:8080")
		assert.deepEqual(settings.lastProjects, {})
		assert.equal(settings.crawlMaxDepth, 3)
		assert.equal(settings.crawlMaxPages, 50)
	})

	it("persists and reloads serverUrl", async () => {
		const service = new DocsIndexSettingsService()
		await service.setServerUrl("http://host:9")
		const raw = JSON.parse(await fs.readFile(file(), "utf8"))
		assert.equal(raw.serverUrl, "http://host:9")
		assert.equal((await new DocsIndexSettingsService().get()).serverUrl, "http://host:9")
	})

	it("preserves mappings across workspaces", async () => {
		const service = new DocsIndexSettingsService()
		await service.setSelectedProject("/ws/a", "projA")
		await service.setSelectedProject("/ws/b", "projB")
		assert.deepEqual((await service.get()).lastProjects, { "/ws/a": "projA", "/ws/b": "projB" })
	})

	it("merges a partial update", async () => {
		const service = new DocsIndexSettingsService()
		await service.setSelectedProject("/ws/a", "projA")
		await service.update({ serverUrl: "http://x:2" })
		const settings = await service.get()
		assert.equal(settings.serverUrl, "http://x:2")
		assert.deepEqual(settings.lastProjects, { "/ws/a": "projA" })
	})

	it("preserves lastProjects when updating serverUrl", async () => {
		const service = new DocsIndexSettingsService()
		await service.setSelectedProject("/ws/a", "projA")
		await service.setServerUrl("http://h:1")
		assert.deepEqual((await service.get()).lastProjects, { "/ws/a": "projA" })
	})

	it("rejects an invalid server URL without writing", async () => {
		await assert.rejects(() => new DocsIndexSettingsService().setServerUrl("not-a-url"), /URL/i)
		await assert.rejects(() => fs.access(file()))
	})

	const wsFile = () => path.join(workspacePath, ".cellockai", "docs_index.json")
	const globalFile = () => path.join(home, ".cellockai", "docs_index.json")

	it("writes selected project to the workspace file, not the global file", async () => {
		workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-ws-"))
		await new DocsIndexSettingsService().setSelectedProject("/ws/here", "projA")
		const ws = JSON.parse(await fs.readFile(wsFile(), "utf8"))
		assert.equal(ws.lastProjects["/ws/here"], "projA")
		await assert.rejects(() => fs.access(globalFile()))
	})

	it("merges global base with workspace override (workspace wins per key)", async () => {
		workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-ws-"))
		// seed global
		await fs.mkdir(path.dirname(globalFile()), { recursive: true })
		await fs.writeFile(
			globalFile(),
			JSON.stringify({ serverUrl: "http://global:1", lastProjects: { "/other": "projOther" } }),
		)
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

	it("returns default crawl limits when nothing is stored", async () => {
		const settings = await new DocsIndexSettingsService().get()
		assert.equal(settings.crawlMaxDepth, 3)
		assert.equal(settings.crawlMaxPages, 50)
	})

	it("workspace crawlMaxDepth/crawlMaxPages override the global defaults", async () => {
		workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-ws-"))
		await fs.mkdir(path.dirname(wsFile()), { recursive: true })
		await fs.writeFile(wsFile(), JSON.stringify({ crawlMaxDepth: 5, crawlMaxPages: 100 }))
		const settings = await new DocsIndexSettingsService().get()
		assert.equal(settings.crawlMaxDepth, 5)
		assert.equal(settings.crawlMaxPages, 100)
		assert.equal(settings.serverUrl, "http://localhost:8080")
	})

	it("update({crawlMaxDepth: 7}) writes 7 to the workspace file and preserves other keys", async () => {
		workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-ws-"))
		const service = new DocsIndexSettingsService()
		await service.setSelectedProject("/ws/here", "projA")
		await service.update({ crawlMaxDepth: 7 })
		const ws = JSON.parse(await fs.readFile(wsFile(), "utf8"))
		assert.equal(ws.crawlMaxDepth, 7)
		assert.equal(ws.crawlMaxPages, 50)
		assert.equal(ws.serverUrl, "http://localhost:8080")
		assert.equal(ws.lastProjects["/ws/here"], "projA")
		const settings = await service.get()
		assert.equal(settings.crawlMaxDepth, 7)
		assert.equal(settings.crawlMaxPages, 50)
	})
})

describe("selectProject", () => {
	it("prefers an exact basename match", () => {
		assert.equal(selectProject(["acme", "myrepo", "other"], "myrepo", "acme"), "myrepo")
	})

	it("uses a valid last project when basename is absent", () => {
		assert.equal(selectProject(["acme", "other"], "myrepo", "acme"), "acme")
	})

	it("uses the first project when last project is absent", () => {
		assert.equal(selectProject(["acme", "other"], "myrepo", "missing"), "acme")
	})

	it("returns empty for no projects", () => {
		assert.equal(selectProject([], "myrepo", undefined), "")
		assert.equal(selectProject([], "myrepo", "anything"), "")
	})
})

describe("isValidServerUrl", () => {
	it("accepts HTTP(S)` URLs", () => {
		assert.equal(isValidServerUrl("http://localhost:8080"), true)
		assert.equal(isValidServerUrl("https://example.com"), true)
	})

	it("rejects malformed and non-HTTP(S)` URLs", () => {
		assert.equal(isValidServerUrl("not-a-url"), false)
		assert.equal(isValidServerUrl("ftp://x"), false)
		assert.equal(isValidServerUrl(""), false)
	})
})
