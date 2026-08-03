import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, it, mock } from "bun:test"

let home = ""

mock.module("@core/storage/disk", () => ({
	getGlobalDocsIndexSettingsFilePath: () => path.join(home, ".cellockai", "docs_index.json"),
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
	})

	afterEach(async () => {
		await fs.rm(home, { recursive: true, force: true })
	})

	const file = () => path.join(home, ".cellockai", "docs_index.json")

	it("returns defaults when file is absent", async () => {
		const settings = await new DocsIndexSettingsService().get()
		assert.equal(settings.serverUrl, "http://localhost:8080")
		assert.deepEqual(settings.lastProjects, {})
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
