import { afterEach, beforeEach, describe, it } from "bun:test"
import "should"
import * as fs from "fs/promises"
import * as path from "node:path"
import sinon from "sinon"
import { McpRegistrationService } from "../McpRegistrationService"

describe("McpRegistrationService", () => {
	let sandbox: sinon.SinonSandbox
	let tmpDir: string
	let settingsPath: string
	let mockMcpHub: { getMcpSettingsFilePath: sinon.SinonStub }

	beforeEach(async () => {
		sandbox = sinon.createSandbox()
		tmpDir = await fs.mkdtemp(path.join(import.meta.dir, ".tmp-mcpreg-"))
		settingsPath = path.join(tmpDir, "mcp_settings.json")
		await fs.writeFile(settingsPath, JSON.stringify({ mcpServers: {} }, null, 2))
		mockMcpHub = {
			getMcpSettingsFilePath: sandbox.stub().resolves(settingsPath),
		}
	})

	afterEach(async () => {
		sandbox.restore()
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	})

	it("isRegistered returns false when no entry exists", async () => {
		const svc = new McpRegistrationService(mockMcpHub as any, "/fake/cbm")
		should(await svc.isRegistered()).be.false()
	})

	it("register writes the entry with the binary path", async () => {
		const svc = new McpRegistrationService(mockMcpHub as any, "/fake/cbm")
		await svc.register()
		const content = JSON.parse(await fs.readFile(settingsPath, "utf8"))
		should(content.mcpServers["codebase-memory-mcp"]).not.be.undefined()
		should(content.mcpServers["codebase-memory-mcp"].command).equal("/fake/cbm")
		should(content.mcpServers["codebase-memory-mcp"].args).deepEqual([])
		should(content.mcpServers["codebase-memory-mcp"].disabled).equal(false)
	})

	it("register is idempotent — no duplicate on re-register", async () => {
		const svc = new McpRegistrationService(mockMcpHub as any, "/fake/cbm")
		await svc.register()
		await svc.register()
		const content = JSON.parse(await fs.readFile(settingsPath, "utf8"))
		const keys = Object.keys(content.mcpServers).filter((k) => k === "codebase-memory-mcp")
		should(keys.length).equal(1)
	})

	it("isRegistered returns true after register", async () => {
		const svc = new McpRegistrationService(mockMcpHub as any, "/fake/cbm")
		await svc.register()
		should(await svc.isRegistered()).be.true()
	})

	it("unregister removes the entry", async () => {
		const svc = new McpRegistrationService(mockMcpHub as any, "/fake/cbm")
		await svc.register()
		await svc.unregister()
		const content = JSON.parse(await fs.readFile(settingsPath, "utf8"))
		should(content.mcpServers["codebase-memory-mcp"]).be.undefined()
	})

	it("isRegistered returns false when command path differs", async () => {
		const svc = new McpRegistrationService(mockMcpHub as any, "/fake/cbm")
		await svc.register()
		// Register with a different path
		const svc2 = new McpRegistrationService(mockMcpHub as any, "/different/path")
		should(await svc2.isRegistered()).be.false()
	})

	it("register preserves existing autoApprove when updating the entry", async () => {
		const svc = new McpRegistrationService(mockMcpHub as any, "/fake/cbm")
		await svc.register()
		// Manually add autoApprove tools
		const content = JSON.parse(await fs.readFile(settingsPath, "utf8"))
		content.mcpServers["codebase-memory-mcp"].autoApprove = ["search_graph", "trace_path"]
		await fs.writeFile(settingsPath, JSON.stringify(content, null, 2))
		// Re-register with a different path (forces overwrite)
		const svc2 = new McpRegistrationService(mockMcpHub as any, "/fake/cbm-v2")
		await svc2.register()
		const updated = JSON.parse(await fs.readFile(settingsPath, "utf8"))
		should(updated.mcpServers["codebase-memory-mcp"].command).equal("/fake/cbm-v2")
		should(updated.mcpServers["codebase-memory-mcp"].autoApprove).deepEqual(["search_graph", "trace_path"])
	})

	it("register includes autoApprove field by default", async () => {
		const svc = new McpRegistrationService(mockMcpHub as any, "/fake/cbm")
		await svc.register()
		const content = JSON.parse(await fs.readFile(settingsPath, "utf8"))
		should(content.mcpServers["codebase-memory-mcp"].autoApprove).deepEqual([])
	})
})
