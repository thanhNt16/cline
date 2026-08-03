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
// (GlobalFileNames, getMcpSettingsFilePath, ...) passes through unchanged.
// readJsonConfigFile (from @core/storage/readJsonConfig) is NOT mocked — it
// reads the real temp files the test writes, so serverExistsInFile sees them.
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

// Task 2: owner-aware write-path resolution. resolveMcpWriteFilePath returns
// the workspace settings file when it already owns the server name, else the
// global file (including for new/unknown names). Bypass the constructor's
// watcher via Object.create(McpHub.prototype), matching deleteServerRPC tests.

describe("McpHub write-path ownership", () => {
	let tempHome: string
	let tempWorkspace: string
	let globalPath: string
	let wsPath: string
	let realHome: string
	let hub: McpHub

	const writeFile = async (p: string, servers: Record<string, unknown>) => {
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

		hub = Object.create(McpHub.prototype) as McpHub
		;(hub as any).getSettingsDirectoryPath = async () => path.dirname(wsPath)
	})
	afterEach(async () => {
		process.env.HOME = realHome
		await fs.rm(tempHome, { recursive: true, force: true })
		await fs.rm(tempWorkspace, { recursive: true, force: true })
	})

	it("new server (no name) resolves to global", async () => {
		const target = await hub.resolveMcpWriteFilePath(undefined)
		target.should.equal(globalPath)
	})

	it("server absent everywhere resolves to global", async () => {
		const target = await hub.resolveMcpWriteFilePath("new-one")
		target.should.equal(globalPath)
	})

	it("server owned by workspace resolves to workspace file", async () => {
		await writeFile(wsPath, { shared: { type: "stdio", command: "a" } })
		const target = await hub.resolveMcpWriteFilePath("shared")
		target.should.equal(wsPath)
	})

	it("server owned only by global resolves to global file", async () => {
		await writeFile(globalPath, { shared: { type: "stdio", command: "g" } })
		const target = await hub.resolveMcpWriteFilePath("shared")
		target.should.equal(globalPath)
	})

	it("workspace ownership wins when present in both layers", async () => {
		await writeFile(globalPath, { shared: { type: "stdio", command: "g" } })
		await writeFile(wsPath, { shared: { type: "stdio", command: "w" } })
		const target = await hub.resolveMcpWriteFilePath("shared")
		target.should.equal(wsPath)
	})
})
