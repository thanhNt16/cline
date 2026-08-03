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

// Task 5 backend: the cellockaiPreset parameter threads through addStdioServer
// and stamps metadata.cellockaiPreset on the persisted config so the Database
// tab can identify preset connections. Mirrors the McpHub.ownerWrites harness,
// which drives owner-aware addStdioServer end-to-end through the real file.

describe("McpHub.addStdioServer cellockaiPreset", () => {
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

		// getProjectSettingsDirectoryPath (stubbed below) normally mkdirs the
		// workspace .cellockai dir; mirror that so getMcpSettingsFilePath can
		// publish the empty workspace file on first read.
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

	it("writes metadata.cellockaiPreset when cellockaiPreset is provided", async () => {
		await hub.addStdioServer("pg", "npx", ["-y", "x"], { POSTGRES_DATABASE: "db" }, undefined, "postgres-mcp-toolbox")

		const servers = await readServers(globalPath)
		assert.deepEqual(servers.pg.metadata, { cellockaiPreset: "postgres-mcp-toolbox" })
	})

	it("writes no metadata when cellockaiPreset is omitted", async () => {
		await hub.addStdioServer("plain", "npx", ["-y", "x"], {})

		const servers = await readServers(globalPath)
		assert.equal(servers.plain.metadata, undefined, "no metadata key should be persisted for plain servers")
	})
})
