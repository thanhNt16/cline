import { strict as assert } from "node:assert"
import { afterEach, beforeEach, describe, it, mock } from "bun:test"
import * as actualDiskModule from "@core/storage/disk"
import fs from "fs/promises"
import os from "os"
import path from "path"
import sinon from "sinon"

const getGlobalMcpSettingsFilePathStub: sinon.SinonStub = sinon.stub()
const getProjectMcpSettingsFilePathsStub: sinon.SinonStub = sinon.stub()
const diskMock = () => ({
	...actualDiskModule,
	getGlobalMcpSettingsFilePath: getGlobalMcpSettingsFilePathStub,
	getProjectMcpSettingsFilePaths: getProjectMcpSettingsFilePathsStub,
})
mock.module("@core/storage/disk", diskMock)
mock.module("@/core/storage/disk", diskMock)

import { McpHub } from "../McpHub"

describe("McpHub add/delete owner writes", () => {
	let tempHome: string
	let tempWorkspace: string
	let globalPath: string
	let wsPath: string
	let overlayPath: string
	let realHome: string | undefined
	let hub: McpHub
	let sandbox: sinon.SinonSandbox

	const writeFile = async (filePath: string, servers: Record<string, unknown>) => {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, JSON.stringify({ mcpServers: servers }, null, 2))
	}

	const readServers = async (filePath: string): Promise<Record<string, unknown>> => {
		const parsed = JSON.parse(await fs.readFile(filePath, "utf8"))
		return parsed.mcpServers
	}

	beforeEach(async () => {
		sandbox = sinon.createSandbox()
		realHome = process.env.HOME
		tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-home-"))
		tempWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-ws-"))
		process.env.HOME = tempHome

		globalPath = path.join(tempHome, ".cellockai", "mcp_settings.json")
		wsPath = path.join(tempWorkspace, ".cellockai", "mcp_settings.json")
		overlayPath = path.join(tempWorkspace, ".cellockai", "mcp.json")

		// The real getProjectSettingsDirectoryPath mkdirs <workspace>/.cellockai;
		// it is stubbed here, so pre-create the dir. getMcpSettingsFilePath (real,
		// NOT stubbed) then creates the settings FILE inside it on first read.
		// The dir existing without the file keeps the overlay-rejection test's
		// fs.access(wsPath) assertion valid (it checks the file, not the dir).
		await fs.mkdir(path.dirname(wsPath), { recursive: true })

		getGlobalMcpSettingsFilePathStub.reset()
		getGlobalMcpSettingsFilePathStub.returns(globalPath)
		getProjectMcpSettingsFilePathsStub.reset()
		getProjectMcpSettingsFilePathsStub.resolves([])

		hub = Object.create(McpHub.prototype) as McpHub
		;(hub as any).getSettingsDirectoryPath = async () => path.dirname(wsPath)
		;(hub as any).connections = []
		sandbox.stub(hub as any, "updateServerConnectionsRPC").resolves()
		sandbox.stub(hub as any, "clearOAuthForConnection").resolves()
	})

	afterEach(async () => {
		sandbox.restore()
		if (realHome === undefined) {
			delete process.env.HOME
		} else {
			process.env.HOME = realHome
		}
		await fs.rm(tempHome, { recursive: true, force: true })
		await fs.rm(tempWorkspace, { recursive: true, force: true })
	})

	it("addStdioServer writes a new server to the global file", async () => {
		await hub.addStdioServer("pg", "npx", ["-y", "x"], { K: "v" })

		assert.ok((await readServers(globalPath)).pg, "expected pg in global")
		assert.ok(!(await readServers(wsPath)).pg, "pg must not be in workspace")
	})

	it("addRemoteServer writes a new server to the global file", async () => {
		await hub.addRemoteServer("remote", "http://localhost:8080/mcp")

		assert.ok((await readServers(globalPath)).remote, "expected remote in global")
		assert.ok(!(await readServers(wsPath)).remote, "remote must not be in workspace")
	})

	it("addStdioServer rejects a name already present in global", async () => {
		await writeFile(globalPath, { pg: { type: "stdio", command: "npx" } })

		await assert.rejects(() => hub.addStdioServer("pg", "npx", ["x"], {}), /already exists/)
	})

	it("deleteServerRPC removes a global-only server from the global file", async () => {
		await writeFile(globalPath, { pg: { type: "stdio", command: "npx" } })

		await hub.deleteServerRPC("pg")

		assert.ok(!(await readServers(globalPath)).pg)
	})

	it("deleteServerRPC removes a workspace-owned server from the workspace file", async () => {
		await writeFile(wsPath, { pg: { type: "stdio", command: "workspace" } })

		await hub.deleteServerRPC("pg")

		assert.ok(!(await readServers(wsPath)).pg)
	})

	it("workspace ownership wins when deleting a name present in both layers", async () => {
		await writeFile(globalPath, { pg: { type: "stdio", command: "global" } })
		await writeFile(wsPath, { pg: { type: "stdio", command: "workspace" } })

		await hub.deleteServerRPC("pg")

		assert.ok((await readServers(globalPath)).pg, "global fallback must remain")
		assert.ok(!(await readServers(wsPath)).pg, "workspace owner must be deleted")
	})

	it("rejects mutation of a project-overlay-only server", async () => {
		await writeFile(overlayPath, { pg: { type: "stdio", command: "overlay" } })
		getProjectMcpSettingsFilePathsStub.resolves([overlayPath])

		await assert.rejects(
			() => hub.addStdioServer("pg", "npx", ["x"], {}),
			/read-only project file/,
		)
		await assert.rejects(() => fs.access(globalPath))
		await assert.rejects(() => fs.access(wsPath))
	})
})
