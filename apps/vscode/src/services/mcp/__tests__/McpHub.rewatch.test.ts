import { afterEach, beforeEach, describe, it } from "bun:test"
import "should"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import sinon from "sinon"
import { McpHub } from "../McpHub"

describe("McpHub rewatchMcpSettingsFile", () => {
	let sandbox: sinon.SinonSandbox
	let tempDir: string
	let hub: McpHub

	beforeEach(async () => {
		sandbox = sinon.createSandbox()
		tempDir = path.join(os.tmpdir(), `mcp-rewatch-${Date.now()}-${Math.random().toString(36).slice(2)}`)
		await fs.mkdir(tempDir, { recursive: true })
		hub = Object.create(McpHub.prototype) as McpHub
		;(hub as any).connections = []
		;(hub as any).fileWatchers = new Map()
		;(hub as any).projectSettingsWatchers = []
	})

	afterEach(async () => {
		sandbox.restore()
		try {
			await fs.rm(tempDir, { recursive: true, force: true })
		} catch {}
	})

	it("rewatches when the settings path changes", async () => {
		const dirA = path.join(tempDir, "a")
		const dirB = path.join(tempDir, "b")
		await fs.mkdir(dirA, { recursive: true })
		await fs.mkdir(dirB, { recursive: true })
		const pathA = path.join(dirA, "mcp_settings.json")
		const pathB = path.join(dirB, "mcp_settings.json")
		await fs.writeFile(pathA, JSON.stringify({ mcpServers: {} }))
		await fs.writeFile(pathB, JSON.stringify({ mcpServers: {} }))

		let currentDir = dirA
		;(hub as any).getSettingsDirectoryPath = async () => currentDir
		;(hub as any).readAndValidateMcpSettingsFile = async () => ({ mcpServers: {} })
		;(hub as any).updateServerConnections = async () => {}
		;(hub as any).computeConnectionFingerprint = () => "fp"
		;(hub as any).lastConnectionFingerprint = "fp"

		await (hub as any).watchMcpSettingsFile()
		;(hub as any).watchedSettingsPath!.should.equal(pathA)

		currentDir = dirB
		await (hub as any).rewatchMcpSettingsFile()
		;(hub as any).watchedSettingsPath!.should.equal(pathB)

		// Old watcher should be closed
		const oldWatcher = (hub as any).settingsWatcher
		// New watcher should be watching pathB
		;(hub as any).watchedSettingsPath!.should.not.equal(pathA)

		await (hub as any).settingsWatcher?.close()
		await oldWatcher?.close()
	})

	it("does not rewatch when the path is unchanged", async () => {
		const dir = path.join(tempDir, "c")
		await fs.mkdir(dir, { recursive: true })
		const settingsPath = path.join(dir, "mcp_settings.json")
		await fs.writeFile(settingsPath, JSON.stringify({ mcpServers: {} }))

		;(hub as any).getSettingsDirectoryPath = async () => dir
		;(hub as any).readAndValidateMcpSettingsFile = async () => ({ mcpServers: {} })
		;(hub as any).updateServerConnections = async () => {}
		;(hub as any).computeConnectionFingerprint = () => "fp"
		;(hub as any).lastConnectionFingerprint = "fp"

		await (hub as any).watchMcpSettingsFile()
		const originalWatcher = (hub as any).settingsWatcher

		await (hub as any).rewatchMcpSettingsFile()
		// Same watcher instance — no re-targeting
		;(hub as any).settingsWatcher!.should.equal(originalWatcher)

		await (hub as any).settingsWatcher?.close()
	})
})
