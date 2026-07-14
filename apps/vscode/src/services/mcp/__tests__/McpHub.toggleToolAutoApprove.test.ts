import { afterEach, beforeEach, describe, it, mock } from "bun:test"
import "should"
import * as actualDiskModule from "@core/storage/disk"
import fs from "fs/promises"
import os from "os"
import path from "path"
import sinon from "sinon"

// bun loads real ESM, so sinon cannot stub the `@core/storage/disk` namespace
// export directly. Inject module-level sinon stubs via mock.module, matching
// McpHub.deleteServerRPC.test.ts.
const getMcpSettingsFilePathStub: sinon.SinonStub = sinon.stub()
const getProjectMcpSettingsFilePathsStub: sinon.SinonStub = sinon.stub()
const diskMock = () => ({
	...actualDiskModule,
	getMcpSettingsFilePath: getMcpSettingsFilePathStub,
	getProjectMcpSettingsFilePaths: getProjectMcpSettingsFilePathsStub,
})
mock.module("@core/storage/disk", diskMock)
mock.module("@/core/storage/disk", diskMock)

import { McpHub } from "../McpHub"

// Reproduces a bug reported against the UI: clicking "auto-approve" on an MCP
// tool triggers a spurious reload of the project MCP settings, during which
// the tool (or its whole server) drops out of the list.
//
// Root cause: every other settings-mutating method in McpHub re-reads the
// merged (global + project) settings via readPostWriteMcpSettings() before
// calling recordSettingsFingerprint() (see McpHub.ts:1404, 1446, 1750, 1799,
// 1833, 1871 — and the analogous test in McpHub.deleteServerRPC.test.ts,
// "pre-seeds the connection fingerprint so the watcher skips its own
// write"). toggleToolAutoApproveRPC/toggleToolAutoApprove instead call
// recordSettingsFingerprint() directly with the raw mutator result, which
// only reflects the global settings file — it never includes project-level
// (.cellockai/mcp.json) servers. Whenever a project settings file
// contributes anything, the recorded fingerprint therefore differs from the
// merged fingerprint the file watcher computes on the very next "change"
// event fired by this method's own write, so the watcher treats its own
// write as an external change and forces a full updateServerConnections()
// reconciliation (server reconnect / tool list refetch) for no reason.
//
// Also covers a secondary gap found while investigating: toggling a tool on a
// server that only exists in the project file crashed with a raw TypeError
// (`servers[serverName].autoApprove` on an undefined entry) instead of the
// clean, catchable "not found" Error every other mutator throws for a missing
// server (see deleteServerRPC/updateServerTimeoutRPC).
//
// Bypasses the constructor's watcher via Object.create(McpHub.prototype),
// matching the sibling McpHub tests.

describe("McpHub.toggleToolAutoApproveRPC with project MCP settings present", () => {
	let sandbox: sinon.SinonSandbox
	let tempDir: string
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
		tempDir = path.join(os.tmpdir(), `mcp-toggle-autoapprove-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
		await fs.mkdir(tempDir, { recursive: true })

		globalSettingsPath = path.join(tempDir, "mcp_settings.json")
		const projectDir = path.join(tempDir, "project")
		projectSettingsPath = path.join(projectDir, ".cellockai", "mcp.json")

		getMcpSettingsFilePathStub.reset()
		getMcpSettingsFilePathStub.resolves(globalSettingsPath)
		getProjectMcpSettingsFilePathsStub.reset()
		getProjectMcpSettingsFilePathsStub.resolves([projectSettingsPath])

		hub = Object.create(McpHub.prototype) as McpHub
		;(hub as any).getSettingsDirectoryPath = async () => tempDir
		;(hub as any).connections = []
	})

	afterEach(async () => {
		sandbox.restore()
		try {
			await fs.rm(tempDir, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
	})

	it("throws a clean, catchable error (not a raw TypeError) for a server defined only in the project file", async () => {
		await writeGlobal({ alpha: { type: "stdio", command: "a" } })
		await writeProject({ beta: { type: "stdio", command: "b" } })

		let threw: Error | undefined
		try {
			await hub.toggleToolAutoApproveRPC("beta", ["toolX"], true)
		} catch (err) {
			threw = err as Error
		}
		;(threw === undefined).should.be.false()
		threw!.message.should.match(/not found in settings/)
	})

	it("records a fingerprint consistent with the merged settings after toggling a global server's tool", async () => {
		await writeGlobal({ alpha: { type: "stdio", command: "a" } })
		await writeProject({ beta: { type: "stdio", command: "b" } })

		await hub.toggleToolAutoApproveRPC("alpha", ["toolX"], true)

		const merged = await (hub as any).readAndValidateMcpSettingsFile()
		const realFingerprint = (hub as any).computeConnectionFingerprint(merged.mcpServers)
		const recordedFingerprint = (hub as any).lastConnectionFingerprint

		// If these differ, the settings-file watcher's next "change" event (fired
		// by this method's own write) will see a mismatch and force a full
		// reconnect/reload — even though nothing actually changed beyond the
		// auto-approve toggle.
		recordedFingerprint.should.equal(realFingerprint)
	})
})
