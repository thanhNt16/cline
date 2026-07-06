import { afterEach, beforeEach, describe, it } from "mocha"
import "should"
import * as diskModule from "@core/storage/disk"
import fs from "fs/promises"
import os from "os"
import path from "path"
import sinon from "sinon"
import { McpHub } from "../McpHub"

// Tests that project-level MCP settings (.cellockai/mcp.json) are merged over the
// global settings file (mcp_settings.json), with project entries winning on
// name collision. Mirrors the McpHub.deleteServerRPC.test.ts harness: the
// constructor's watcher is bypassed via Object.create(McpHub.prototype).

describe("McpHub project MCP merge (.cellockai/mcp.json)", () => {
	let sandbox: sinon.SinonSandbox
	let tempDir: string
	let projectDir: string
	let globalSettingsPath: string
	let projectSettingsPath: string
	let hub: McpHub

	const writeGlobal = async (mcpServers: Record<string, unknown>) => {
		await fs.writeFile(globalSettingsPath, JSON.stringify({ mcpServers }, null, 2))
	}

	const writeProject = async (mcpServers: Record<string, unknown>) => {
		await fs.mkdir(path.dirname(projectSettingsPath), { recursive: true })
		await fs.writeFile(projectSettingsPath, JSON.stringify({ mcpServers }, null, 2))
	}

	beforeEach(async () => {
		sandbox = sinon.createSandbox()
		tempDir = path.join(os.tmpdir(), `mcp-merge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
		await fs.mkdir(tempDir, { recursive: true })

		globalSettingsPath = path.join(tempDir, "mcp_settings.json")
		projectDir = path.join(tempDir, "project")
		projectSettingsPath = path.join(projectDir, ".cellockai", "mcp.json")

		// Point the global settings file at the temp file, and the project source at
		// a project-local .cellockai/mcp.json under a fake workspace root.
		sandbox.stub(diskModule, "getMcpSettingsFilePath").resolves(globalSettingsPath)
		sandbox.stub(diskModule, "getProjectMcpSettingsFilePaths").resolves([projectSettingsPath])

		hub = Object.create(McpHub.prototype) as McpHub
		;(hub as any).getSettingsDirectoryPath = async () => tempDir
	})

	afterEach(async () => {
		sandbox.restore()
		try {
			await fs.rm(tempDir, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
	})

	it("merges project servers over global servers", async () => {
		await writeGlobal({ alpha: { type: "stdio", command: "a" } })
		await writeProject({ beta: { type: "stdio", command: "b" } })

		const result = await (hub as any).readAndValidateMcpSettingsFile()

		Object.keys(result.mcpServers).sort().should.deepEqual(["alpha", "beta"])
	})

	it("project entry wins on name collision with global", async () => {
		await writeGlobal({ shared: { type: "stdio", command: "global-cmd" } })
		await writeProject({ shared: { type: "stdio", command: "project-cmd" } })

		const result = await (hub as any).readAndValidateMcpSettingsFile()

		result.mcpServers.shared.command.should.equal("project-cmd")
	})

	it("returns global servers unchanged when the project file is unreadable", async () => {
		await writeGlobal({ alpha: { type: "stdio", command: "a" } })
		// Stub returns a path that was never written, so the read throws and the
		// loader logs + skips it, leaving global servers intact.
		const missingPath = path.join(tempDir, "never-written.json")
		;(diskModule.getProjectMcpSettingsFilePaths as sinon.SinonStub).resolves([missingPath])

		const result = await (hub as any).readAndValidateMcpSettingsFile()

		Object.keys(result.mcpServers).should.deepEqual(["alpha"])
	})

	it("skips a malformed project file without dropping global servers", async () => {
		await writeGlobal({ alpha: { type: "stdio", command: "a" } })
		await fs.mkdir(path.dirname(projectSettingsPath), { recursive: true })
		await fs.writeFile(projectSettingsPath, "{ not valid json")

		const result = await (hub as any).readAndValidateMcpSettingsFile()

		// Global server survives; malformed project file is logged and skipped.
		Object.keys(result.mcpServers).should.deepEqual(["alpha"])
	})
})
