import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { McpHub } from "@services/mcp/McpHub"
import type { ClineExtensionContext } from "@shared/cline"
import {
	CodebaseMemoryStatus,
	CodebaseMemoryTool,
	IndexProgressEvent,
	IndexProgressEvent_Level,
} from "@shared/proto/cline/codebase_memory"
import { Logger } from "@/shared/services/Logger"
import { BinaryManager } from "./BinaryManager"
import { BINARY_SUBDIR, toProtoTools } from "./constants"
import { GraphServerService } from "./GraphServerService"
import { IndexingService, type ProgressHandler } from "./IndexingService"
import { McpRegistrationService } from "./McpRegistrationService"
import type { Arch, Platform } from "./types"

interface IndexInfo {
	isIndexed: boolean
	projectName: string
	nodeCount: number
	edgeCount: number
	indexedAt: number
}

export class CodebaseMemoryFacade {
	private binaryManager: BinaryManager
	private graphServer: GraphServerService
	private mcpRegistration: McpRegistrationService
	private indexingService: IndexingService | undefined
	private lastIndexedRepo: string | undefined
	private cachedIndexInfo: IndexInfo | null = null
	private cachedBinaryVersion: string | undefined
	private versionFetchPromise: Promise<void> | null = null
	private readonly storageDir: string
	private readonly indexInfoPath: string

	constructor(context: ClineExtensionContext, mcpHub: McpHub) {
		const storageDir = context.globalStorageUri.fsPath
		const platform = this.detectPlatform()
		const arch = this.detectArch()
		Logger.log(`[CBM-DIAG] CodebaseMemoryFacade constructed: storageDir=${storageDir} platform=${platform} arch=${arch}`)
		this.storageDir = storageDir
		this.indexInfoPath = path.join(storageDir, BINARY_SUBDIR, "index-info.json")
		this.binaryManager = new BinaryManager(storageDir, platform, arch)
		this.graphServer = new GraphServerService(
			() => this.binaryManager.getUiBinaryPath() ?? this.binaryManager.getBinaryPath()!,
		)
		this.mcpRegistration = new McpRegistrationService(mcpHub, this.binaryManager.getBinaryPath()!)
		this.cachedIndexInfo = this.loadIndexInfo()
		Logger.log(`[CBM-DIAG] CodebaseMemoryFacade loaded cached index info: ${JSON.stringify(this.cachedIndexInfo)}`)
	}

	async getStatus(): Promise<CodebaseMemoryStatus> {
		const binaryInstalled = await this.binaryManager.isBinaryPresent()
		const binaryPath = this.binaryManager.getBinaryPath()
		const graphServerRunning = this.graphServer.isRunning()

		// Fetch version lazily (non-blocking) — populate cache for subsequent calls
		if (binaryInstalled && this.cachedBinaryVersion === undefined && !this.versionFetchPromise) {
			this.versionFetchPromise = this.binaryManager.getInstalledVersion().then((v) => {
				this.cachedBinaryVersion = v
				this.versionFetchPromise = null
			})
		}

		let mcpServerRegistered = false
		if (binaryInstalled) {
			try {
				mcpServerRegistered = await this.mcpRegistration.isRegistered()
			} catch (e) {
				Logger.log(`[CBM-DIAG] getStatus: isRegistered failed: ${(e as Error).message}`)
			}
		}

		return CodebaseMemoryStatus.create({
			binaryInstalled,
			binaryVersion: this.cachedBinaryVersion,
			binaryPath,
			isIndexed: this.cachedIndexInfo?.isIndexed ?? false,
			indexedProjectName: this.cachedIndexInfo?.projectName,
			indexedNodeCount: this.cachedIndexInfo?.nodeCount,
			indexedEdgeCount: this.cachedIndexInfo?.edgeCount,
			indexedAt: this.cachedIndexInfo?.indexedAt,
			graphServerRunning,
			mcpServerRegistered,
		})
	}

	async indexProject(repoPath: string, onProgress: ProgressHandler): Promise<void> {
		if (!repoPath) {
			onProgress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.ERROR,
					message: "No workspace folder open — open a project folder first.",
				}),
			)
			return
		}

		try {
			onProgress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.INFO,
					message: "Checking codebase-memory binary…",
					phase: "Checking binary",
					percent: 0,
				}),
			)
			await this.binaryManager.ensureBinary((p) => {
				onProgress(
					IndexProgressEvent.create({
						level: IndexProgressEvent_Level.INFO,
						message: `Downloading binary… ${Math.round(p.pct)}%`,
						phase: "Downloading binary",
						percent: Math.round(p.pct),
					}),
				)
			})

			this.lastIndexedRepo = repoPath
			let lastNodeCount = 0
			let lastEdgeCount = 0
			const wrappedProgress: ProgressHandler = (event) => {
				if (event.nodeCount !== undefined) lastNodeCount = event.nodeCount
				if (event.edgeCount !== undefined) lastEdgeCount = event.edgeCount
				onProgress(event)
			}
			this.indexingService = new IndexingService(
				() => this.binaryManager.getBinaryPath()!,
				wrappedProgress,
				() => this.lastIndexedRepo,
			)
			await this.indexingService.indexProject(repoPath)

			this.cachedIndexInfo = {
				isIndexed: true,
				projectName: repoPath.split("/").pop() || repoPath,
				nodeCount: lastNodeCount,
				edgeCount: lastEdgeCount,
				indexedAt: Date.now(),
			}
			await this.saveIndexInfo(this.cachedIndexInfo)

			onProgress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.INFO,
					message: "Registering codebase-memory-mcp as MCP server…",
					phase: "Registering MCP server",
					percent: 100,
				}),
			)
			await this.mcpRegistration.register()
		} catch (err) {
			onProgress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.ERROR,
					message: `Failed: ${err instanceof Error ? err.message : String(err)}`,
				}),
			)
			throw err
		}
	}

	async reindexProject(onProgress: ProgressHandler): Promise<void> {
		if (!this.lastIndexedRepo) {
			onProgress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.ERROR,
					message: "No project has been indexed yet — index a project first.",
				}),
			)
			return
		}

		try {
			await this.binaryManager.ensureBinary((p) => {
				onProgress(
					IndexProgressEvent.create({
						level: IndexProgressEvent_Level.INFO,
						message: `Downloading binary... ${Math.round(p.pct)}%`,
					}),
				)
			})
		} catch (err) {
			onProgress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.ERROR,
					message: `Failed: ${err instanceof Error ? err.message : String(err)}`,
				}),
			)
			throw err
		}

		this.indexingService = new IndexingService(
			() => this.binaryManager.getBinaryPath()!,
			onProgress,
			() => this.lastIndexedRepo,
		)
		await this.indexingService.reindexProject()
	}

	async downloadBinary(onProgress: ProgressHandler): Promise<void> {
		try {
			onProgress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.INFO,
					message: "Downloading codebase-memory-mcp binary...",
				}),
			)
			await this.binaryManager.ensureBinary((p) => {
				onProgress(
					IndexProgressEvent.create({
						level: IndexProgressEvent_Level.INFO,
						message: `Downloading binary... ${Math.round(p.pct)}%`,
					}),
				)
			})
			onProgress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.DONE,
					message: "Binary installed successfully.",
				}),
			)
		} catch (err) {
			onProgress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.ERROR,
					message: `Failed to download binary: ${err instanceof Error ? err.message : String(err)}`,
				}),
			)
			throw err
		}
	}

	async viewGraph(onProgress?: (event: IndexProgressEvent) => void): Promise<string> {
		try {
			onProgress?.(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.INFO,
					message: "Ensuring graph UI binary is installed...",
				}),
			)
			await this.binaryManager.ensureUiBinary()
		} catch (err) {
			Logger.log(`[CBM-DIAG] viewGraph: ensureUiBinary failed: ${(err as Error).message}`)
			onProgress?.(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.ERROR,
					message: `Failed to install graph UI binary: ${err instanceof Error ? err.message : String(err)}`,
				}),
			)
			throw err
		}
		const config = await this.graphServer.start()
		return config.url
	}

	stopGraphServer(): void {
		this.graphServer.stop()
	}

	listTools(): CodebaseMemoryTool[] {
		return toProtoTools()
	}

	dispose(): void {
		this.indexingService?.cancel()
	}

	private loadIndexInfo(): IndexInfo | null {
		try {
			const fsSync = require("node:fs") as typeof import("node:fs")
			const content = fsSync.readFileSync(this.indexInfoPath, "utf8")
			return JSON.parse(content) as IndexInfo
		} catch {
			return null
		}
	}

	private async saveIndexInfo(info: IndexInfo): Promise<void> {
		try {
			await fs.mkdir(path.dirname(this.indexInfoPath), { recursive: true })
			await fs.writeFile(this.indexInfoPath, JSON.stringify(info, null, 2))
		} catch (e) {
			Logger.log(`[CBM-DIAG] saveIndexInfo failed: ${(e as Error).message}`)
		}
	}

	private async getStatusIndexInfo(): Promise<IndexInfo | null> {
		const binPath = this.binaryManager.getBinaryPath()
		Logger.log(`[CBM-DIAG] getStatusIndexInfo: binPath=${binPath}`)
		if (!binPath) return null
		try {
			const { execFile } = await import("node:child_process")
			const { promisify } = await import("node:util")
			const execFileAsync = promisify(execFile)
			const { stdout, stderr } = await execFileAsync(binPath, ["cli", "list_projects"], { timeout: 10000 })
			Logger.log(`[CBM-DIAG] getStatusIndexInfo: stdout=${stdout.substring(0, 500)}`)
			if (stderr) {
				Logger.log(`[CBM-DIAG] getStatusIndexInfo: stderr=${stderr.substring(0, 500)}`)
			}
			const jsonLine = stdout
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l.startsWith("{") || l.startsWith("["))
				.find(Boolean)
			if (!jsonLine) {
				Logger.log(`[CBM-DIAG] getStatusIndexInfo: no JSON line found in output`)
				return null
			}
			let parsed: unknown
			try {
				parsed = JSON.parse(jsonLine)
			} catch (parseErr) {
				Logger.log(`[CBM-DIAG] getStatusIndexInfo: JSON parse failed: ${(parseErr as Error).message}`)
				return null
			}
			const projects = Array.isArray(parsed)
				? parsed
				: Array.isArray((parsed as Record<string, unknown>).projects)
					? ((parsed as Record<string, unknown>).projects as unknown[])
					: null
			if (!projects || projects.length === 0) {
				Logger.log(`[CBM-DIAG] getStatusIndexInfo: no projects found`)
				return null
			}
			const p = projects[0] as {
				name?: string
				project?: string
				path?: string
				root_path?: string
				node_count?: number
				nodes?: number
				edge_count?: number
				edges?: number
				indexed_at?: number
			}
			Logger.log(`[CBM-DIAG] getStatusIndexInfo: first project=${JSON.stringify(p).substring(0, 300)}`)
			return {
				isIndexed: true,
				projectName: p.name ?? p.project ?? p.path ?? p.root_path ?? "unknown",
				nodeCount: p.node_count ?? p.nodes ?? 0,
				edgeCount: p.edge_count ?? p.edges ?? 0,
				indexedAt: p.indexed_at ?? 0,
			}
		} catch (e) {
			Logger.log(`[CBM-DIAG] getStatusIndexInfo: error=${(e as Error).message}`)
			return null
		}
	}

	private detectPlatform(): Platform {
		switch (process.platform) {
			case "darwin":
				return "darwin"
			case "win32":
				return "windows"
			default:
				return "linux"
		}
	}

	private detectArch(): Arch {
		return process.arch === "arm64" ? "arm64" : "amd64"
	}
}
