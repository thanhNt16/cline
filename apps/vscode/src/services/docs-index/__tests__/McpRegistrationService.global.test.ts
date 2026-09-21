import { afterEach, beforeEach, describe, it } from "bun:test"
import { strict as assert } from "node:assert"
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
