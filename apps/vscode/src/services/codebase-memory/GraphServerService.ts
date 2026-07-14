import childProcess from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { Logger } from "@/shared/services/Logger"
import { DEFAULT_GRAPH_PORT, GRAPH_PORT_FALLBACKS } from "./constants"
import type { GraphServerConfig } from "./types"

const POLL_INTERVAL_MS = 200
const START_TIMEOUT_MS = 10_000

export class GraphServerService {
	private process: ChildProcess | undefined
	private currentConfig: GraphServerConfig | undefined

	constructor(private readonly uiBinaryPath: () => string) {}

	isRunning(): boolean {
		if (this.process && !this.process.killed) {
			return true
		}
		if (this.currentConfig) {
			return true
		}
		return false
	}

	getUrl(): string | undefined {
		return this.currentConfig?.url
	}

	async start(): Promise<GraphServerConfig> {
		if (this.isRunning() && this.currentConfig) {
			return this.currentConfig
		}
		for (const port of [DEFAULT_GRAPH_PORT, ...GRAPH_PORT_FALLBACKS]) {
			if (await this.isPortServing(port)) {
				this.currentConfig = { port, url: `http://localhost:${port}` }
				Logger.log(`[CBM-DIAG] GraphServerService.start: reusing existing server on port ${port}`)
				return this.currentConfig
			}
		}
		const port = await this.findAvailablePort()
		const config: GraphServerConfig = { port, url: `http://localhost:${port}` }
		const binPath = this.uiBinaryPath()
		Logger.log(`[CBM-DIAG] GraphServerService.start: spawning ${binPath} --ui=true --port=${port}`)
		const child = childProcess.spawn(binPath, ["--ui=true", `--port=${port}`], {
			stdio: ["pipe", "pipe", "pipe"],
			detached: true,
		})
		child.unref()
		this.process = child
		this.currentConfig = config

		child.stdout?.on("data", (chunk: Buffer) => {
			Logger.log(`[CBM-DIAG] graph server stdout: ${chunk.toString("utf8").trim()}`)
		})
		child.stderr?.on("data", (chunk: Buffer) => {
			Logger.log(`[CBM-DIAG] graph server stderr: ${chunk.toString("utf8").trim()}`)
		})
		child.on("error", (err) => {
			Logger.log(`[CBM-DIAG] graph server spawn error: ${err.message}`)
		})
		child.on("exit", (code, signal) => {
			Logger.log(`[CBM-DIAG] graph server exited: code=${code} signal=${signal}`)
			this.process = undefined
			this.currentConfig = undefined
		})

		await this.waitForPort(port)
		return config
	}

	stop(): void {
		if (this.process && !this.process.killed) {
			try {
				process.kill(-this.process.pid!, "SIGTERM")
			} catch {
				this.process.kill("SIGTERM")
			}
		}
		this.process = undefined
		this.currentConfig = undefined
	}

	private async findAvailablePort(): Promise<number> {
		const candidates = [DEFAULT_GRAPH_PORT, ...GRAPH_PORT_FALLBACKS]
		for (const port of candidates) {
			if (await this.isPortFree(port)) {
				return port
			}
		}
		return DEFAULT_GRAPH_PORT
	}

	private async isPortFree(port: number): Promise<boolean> {
		try {
			await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(500) })
			return false
		} catch {
			return true
		}
	}

	private async isPortServing(port: number): Promise<boolean> {
		try {
			const resp = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1000) })
			return resp.ok || resp.status === 200 || resp.status === 404
		} catch {
			return false
		}
	}

	private async waitForPort(port: number): Promise<void> {
		const deadline = Date.now() + START_TIMEOUT_MS
		while (Date.now() < deadline) {
			try {
				const resp = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(500) })
				if (resp.ok || resp.status === 200) {
					return
				}
			} catch {
				// Not ready yet
			}
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
		}
		throw new Error(`Graph server did not start within ${START_TIMEOUT_MS / 1000}s on port ${port}`)
	}
}
