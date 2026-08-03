import { strict as assert } from "node:assert"
import { afterEach, beforeEach, describe, it } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { McpRegistrationService } from "../McpRegistrationService"

describe("McpRegistrationService writes to global", () => {
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
			// The legacy default points at workspace; owner resolution must win.
			getMcpSettingsFilePath: async () => wsPath,
			resolveMcpWriteFilePath: async (_name?: string) => globalPath,
		}
		svc = new McpRegistrationService(fakeHub as any)
	})

	afterEach(async () => {
		if (realHome === undefined) delete process.env.HOME
		else process.env.HOME = realHome
		await fs.rm(tempHome, { recursive: true, force: true })
		await fs.rm(tempWorkspace, { recursive: true, force: true })
	})

	it("register writes the vessel-indexer entry to the global file", async () => {
		await svc.register("http://localhost:20130")
		const global = JSON.parse(await fs.readFile(globalPath, "utf8"))
		assert.equal(global.mcpServers["vessel-indexer"].url, "http://localhost:20130/mcp")
		await assert.rejects(() => fs.access(wsPath))
	})

	it("isRegistered reads the owning global file", async () => {
		await svc.register("http://localhost:20130")
		assert.equal(await svc.isRegistered("http://localhost:20130"), true)
	})

	it("unregister removes the entry from the owning global file", async () => {
		await svc.register("http://localhost:20130")
		await svc.unregister()
		const global = JSON.parse(await fs.readFile(globalPath, "utf8"))
		assert.ok(!global.mcpServers["vessel-indexer"])
	})
})
