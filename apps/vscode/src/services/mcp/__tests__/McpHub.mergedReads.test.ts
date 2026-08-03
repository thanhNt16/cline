import { afterEach, beforeEach, describe, it, mock } from "bun:test"
import "should"
import * as actualDiskModule from "@core/storage/disk"
import fs from "fs/promises"
import os from "os"
import path from "path"
import sinon from "sinon"

// bun loads real ESM, so sinon cannot stub the `@core/storage/disk` namespace
// export. Inject module-level sinon stubs via mock.module for the exact
// specifiers the SUT imports, spreading the real module so every other export
// passes through unchanged. readJsonConfigFile (from @core/storage/readJsonConfig)
// is NOT mocked — it reads the real temp files the test writes.
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

// Task 6: merged reads. fetchToolsList and notifyWebviewOfServerChanges must
// resolve autoApprove / server ordering from the MERGED settings (global +
// workspace), not the workspace-only primary file. This suite pins the
// readAndValidateMcpSettingsFile behavior the two callers now rely on: a
// global-only server appears alongside a workspace-only server.
describe("McpHub merged reads include global servers", () => {
	let tempHome: string
	let tempWorkspace: string
	let globalPath: string
	let wsPath: string
	let realHome: string
	let hub: McpHub

	const seed = async (p: string, servers: Record<string, unknown>) => {
		await fs.mkdir(path.dirname(p), { recursive: true })
		await fs.writeFile(p, JSON.stringify({ mcpServers: servers }, null, 2))
	}

	beforeEach(async () => {
		realHome = process.env.HOME as string
		tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-home-"))
		tempWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-ws-"))
		process.env.HOME = tempHome

		globalPath = path.join(tempHome, ".cellockai", "mcp_settings.json")
		wsPath = path.join(tempWorkspace, ".cellockai", "mcp_settings.json")

		getGlobalMcpSettingsFilePathStub.reset()
		getGlobalMcpSettingsFilePathStub.returns(globalPath)
		getProjectMcpSettingsFilePathsStub.reset()
		getProjectMcpSettingsFilePathsStub.resolves([])
		// Production getProjectSettingsDirectoryPath creates this directory before
		// getMcpSettingsFilePath publishes the empty workspace file. This test
		// injects getSettingsDirectoryPath directly, so mirror that precondition.
		await fs.mkdir(path.dirname(wsPath), { recursive: true })

		hub = Object.create(McpHub.prototype) as McpHub
		;(hub as any).getSettingsDirectoryPath = async () => path.dirname(wsPath)
	})
	afterEach(async () => {
		process.env.HOME = realHome
		await fs.rm(tempHome, { recursive: true, force: true })
		await fs.rm(tempWorkspace, { recursive: true, force: true })
	})

	it("merged read returns servers from both layers", async () => {
		await seed(globalPath, { alpha: { type: "stdio", command: "a", autoApprove: ["t1"] } })
		await seed(wsPath, { beta: { type: "stdio", command: "b" } })
		const settings = await (hub as any).readAndValidateMcpSettingsFile()
		Object.keys(settings.mcpServers).sort().should.deepEqual(["alpha", "beta"])
	})

	it("merged read resolves autoApprove for a global-only server", async () => {
		await seed(globalPath, { pg: { type: "stdio", command: "x", autoApprove: ["execute_sql"] } })
		const settings = await (hub as any).readAndValidateMcpSettingsFile()
		settings.mcpServers.pg.autoApprove.should.deepEqual(["execute_sql"])
	})

	it("workspace override replaces a global server's autoApprove", async () => {
		await seed(globalPath, { shared: { type: "stdio", command: "g", autoApprove: ["a"] } })
		await seed(wsPath, { shared: { type: "stdio", command: "w", autoApprove: ["b", "c"] } })
		const settings = await (hub as any).readAndValidateMcpSettingsFile()
		settings.mcpServers.shared.autoApprove.should.deepEqual(["b", "c"])
		settings.mcpServers.shared.command.should.equal("w")
	})
})
