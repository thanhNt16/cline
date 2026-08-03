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

const stdio = (command = "npx"): Record<string, unknown> => ({
	type: "stdio",
	command,
	args: [],
	disabled: false,
	autoApprove: [],
})

describe("McpHub edit mutations respect ownership", () => {
	let sandbox: sinon.SinonSandbox
	let tempHome: string
	let tempWorkspace: string
	let globalPath: string
	let wsPath: string
	let realHome: string | undefined
	let hub: McpHub

	const seed = async (filePath: string, servers: Record<string, unknown>) => {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, JSON.stringify({ mcpServers: servers }, null, 2))
	}

	const readServers = async (filePath: string): Promise<Record<string, any>> => {
		return JSON.parse(await fs.readFile(filePath, "utf8")).mcpServers
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
		sandbox.stub(hub as any, "deleteConnection").resolves()
		sandbox.stub(hub as any, "connectToServer").resolves()
		sandbox.stub(hub as any, "notifyWebviewOfServerChanges").resolves()
	})

	afterEach(async () => {
		sandbox.restore()
		if (realHome === undefined) delete process.env.HOME
		else process.env.HOME = realHome
		await fs.rm(tempHome, { recursive: true, force: true })
		await fs.rm(tempWorkspace, { recursive: true, force: true })
	})

	it("edits a global-only server in the global file", async () => {
		await seed(globalPath, { pg: stdio() })
		await hub.toggleServerDisabledRPC("pg", true)

		assert.equal((await readServers(globalPath)).pg.disabled, true)
		assert.ok(!(await readServers(wsPath)).pg, "no masked workspace entry created")
	})

	it("edits a workspace override in the workspace file", async () => {
		await seed(globalPath, { pg: stdio("global-cmd") })
		await seed(wsPath, { pg: stdio("ws-cmd") })
		await hub.toggleServerDisabledRPC("pg", true)

		assert.equal((await readServers(wsPath)).pg.disabled, true)
		assert.equal((await readServers(globalPath)).pg.disabled, false, "global untouched")
	})

	it("toggleToolAutoApproveRPC writes to the owning layer", async () => {
		await seed(globalPath, { pg: stdio() })
		await hub.toggleToolAutoApproveRPC("pg", ["execute_sql"], true)

		assert.deepEqual((await readServers(globalPath)).pg.autoApprove, ["execute_sql"])
	})

	it("toggleToolAutoApprove writes to the owning layer", async () => {
		await seed(globalPath, { pg: stdio() })
		await hub.toggleToolAutoApprove("pg", ["execute_sql"], true)

		assert.deepEqual((await readServers(globalPath)).pg.autoApprove, ["execute_sql"])
	})

	it("updateServerTimeoutRPC writes to the owning layer", async () => {
		await seed(globalPath, { pg: stdio() })
		await hub.updateServerTimeoutRPC("pg", 120)

		assert.equal((await readServers(globalPath)).pg.timeout, 120)
	})
})
