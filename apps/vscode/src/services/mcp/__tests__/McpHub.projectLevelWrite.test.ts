import { afterEach, beforeEach, describe, it, mock } from "bun:test"
import { strict as assert } from "node:assert"
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

// Project-level writes: addStdioServer(..., projectLevel=true) must persist to
// the workspace .cellockai/mcp_settings.json while the default (false/omitted)
// persists to the global file. Bypasses the constructor's watcher via
// Object.create(McpHub.prototype), matching McpHub.postgresPreset.test.ts, and
// drives the real updateMcpSettingsFile write path end-to-end.

describe("McpHub project-level MCP writes", () => {
	let tempHome: string
	let tempWorkspace: string
	let globalPath: string
	let wsPath: string
	let realHome: string | undefined
	let hub: McpHub
	let sandbox: sinon.SinonSandbox

	const readServers = async (filePath: string): Promise<Record<string, any>> => {
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

	it("writes to the workspace file when projectLevel is true", async () => {
		await hub.addStdioServer("db", "npx", ["-y", "x"], {}, undefined, "postgres-mcp-toolbox", true)

		const servers = await readServers(wsPath)
		assert.ok(servers.db, "server should be persisted to the workspace file")
		assert.equal(servers.db.type, "stdio")

		// The global file must NOT contain the project-level server.
		const globalExists = await fs
			.access(globalPath)
			.then(() => true)
			.catch(() => false)
		if (globalExists) {
			const globalServers = await readServers(globalPath)
			assert.equal(globalServers.db, undefined, "project-level server must not leak into the global file")
		}
	})

	it("writes to the global file when projectLevel is false", async () => {
		await hub.addStdioServer("svc", "cmd", ["--serve"], {})

		const servers = await readServers(globalPath)
		assert.ok(servers.svc, "server should be persisted to the global file")

		const wsExists = await fs
			.access(wsPath)
			.then(() => true)
			.catch(() => false)
		if (wsExists) {
			const wsServers = await readServers(wsPath)
			assert.equal(wsServers.svc, undefined, "global server must not be persisted to the workspace file")
		}
	})
})
