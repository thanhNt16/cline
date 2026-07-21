import { type ChildProcess, spawn } from "node:child_process"
import { IndexProgressEvent, IndexProgressEvent_Level } from "@shared/proto/cline/codebase_memory"
import { INDEXING_NO_OUTPUT_TIMEOUT_MS } from "./constants"
import type { IndexingResult } from "./types"

export type ProgressHandler = (event: IndexProgressEvent) => void

export class IndexingService {
	private currentProcess: ChildProcess | undefined
	private noOutputTimer: ReturnType<typeof setTimeout> | undefined
	private lastJsonLine: string | undefined

	constructor(
		private readonly binaryPath: () => string,
		private readonly progress: ProgressHandler,
		private readonly lastIndexedRepo: () => string | undefined,
	) {}

	async indexProject(repoPath: string): Promise<void> {
		this.lastJsonLine = undefined
		await this.runCli(repoPath, ["cli", "index_repository"], JSON.stringify({ repo_path: repoPath }))
	}

	async reindexProject(): Promise<void> {
		const repo = this.lastIndexedRepo()
		if (!repo) {
			this.progress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.ERROR,
					message: "No project has been indexed yet — index a project first.",
				}),
			)
			return
		}
		this.lastJsonLine = undefined
		await this.runCli(repo, ["cli", "index_repository"], JSON.stringify({ repo_path: repo }))
	}

	cancel(): void {
		this.clearNoOutputTimer()
		if (this.currentProcess && !this.currentProcess.killed) {
			this.currentProcess.kill("SIGTERM")
		}
	}

	/**
	 * Tool args are piped over stdin (as the pinned CLI's `cli <tool> < args.json` form)
	 * rather than passed as a positional argv JSON string: it's UTF-8-clean (no shell/argv
	 * encoding pitfalls for exotic repo paths), and — unlike the positional form — doesn't
	 * print a "deprecated" warning on every run.
	 */
	private runCli(repoPath: string, args: string[], stdinJson: string): Promise<void> {
		return new Promise((resolve) => {
			const bin = this.binaryPath()
			const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] })
			this.currentProcess = child
			this.resetNoOutputTimer()
			child.stdin?.end(stdinJson)

			const handleLine = (line: string) => {
				this.resetNoOutputTimer()
				const trimmed = line.trim()
				if (!trimmed) return
				if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
					this.lastJsonLine = trimmed
					return
				}
				this.progress(
					IndexProgressEvent.create({
						level: IndexProgressEvent_Level.INFO,
						message: trimmed,
					}),
				)
			}

			const flushBuffer = (chunk: Buffer, source: "stdout" | "stderr") => {
				const str = chunk.toString("utf8")
				const lines = str.split("\n")
				for (const line of lines) {
					if (source === "stderr" && line.trim()) {
						this.resetNoOutputTimer()
						this.progress(
							IndexProgressEvent.create({
								level: IndexProgressEvent_Level.WARN,
								message: line.trim(),
							}),
						)
					} else if (line.trim()) {
						handleLine(line)
					}
				}
			}

			child.stdout?.on("data", (chunk: Buffer) => flushBuffer(chunk, "stdout"))
			child.stderr?.on("data", (chunk: Buffer) => flushBuffer(chunk, "stderr"))

			child.on("exit", (code, signal) => {
				this.clearNoOutputTimer()
				this.currentProcess = undefined
				if (code === 0) {
					const result = this.parseResultLine()
					this.progress(
						IndexProgressEvent.create({
							level: IndexProgressEvent_Level.DONE,
							message: `Indexed ${repoPath} — ${result.nodeCount} nodes, ${result.edgeCount} edges`,
							nodeCount: result.nodeCount,
							edgeCount: result.edgeCount,
						}),
					)
				} else if (signal) {
					this.progress(
						IndexProgressEvent.create({
							level: IndexProgressEvent_Level.ERROR,
							message: `Indexing process exited with signal ${signal}`,
						}),
					)
				} else {
					const hint = this.parseErrorHint()
					this.progress(
						IndexProgressEvent.create({
							level: IndexProgressEvent_Level.ERROR,
							message: hint ?? `Indexing failed with exit code ${code}`,
						}),
					)
				}
				resolve()
			})

			child.on("error", (err) => {
				this.clearNoOutputTimer()
				this.currentProcess = undefined
				this.progress(
					IndexProgressEvent.create({
						level: IndexProgressEvent_Level.ERROR,
						message: `Failed to spawn indexing process: ${err.message}`,
					}),
				)
				resolve()
			})
		})
	}

	private parseResultLine(): IndexingResult {
		if (!this.lastJsonLine) {
			return { nodeCount: 0, edgeCount: 0, projectName: "" }
		}
		try {
			const parsed = JSON.parse(this.lastJsonLine) as {
				status?: string
				nodes?: number
				edges?: number
				project?: string
			}
			return {
				nodeCount: parsed.nodes ?? 0,
				edgeCount: parsed.edges ?? 0,
				projectName: parsed.project ?? "",
			}
		} catch {
			return { nodeCount: 0, edgeCount: 0, projectName: "" }
		}
	}

	private parseErrorHint(): string | undefined {
		if (!this.lastJsonLine) return undefined
		try {
			const parsed = JSON.parse(this.lastJsonLine) as { hint?: string }
			return parsed.hint
		} catch {
			return undefined
		}
	}

	private resetNoOutputTimer(): void {
		this.clearNoOutputTimer()
		this.noOutputTimer = setTimeout(() => {
			this.cancel()
			this.progress(
				IndexProgressEvent.create({
					level: IndexProgressEvent_Level.ERROR,
					message: `Indexing timed out — no output for ${INDEXING_NO_OUTPUT_TIMEOUT_MS / 1000}s`,
				}),
			)
		}, INDEXING_NO_OUTPUT_TIMEOUT_MS)
	}

	private clearNoOutputTimer(): void {
		if (this.noOutputTimer) {
			clearTimeout(this.noOutputTimer)
			this.noOutputTimer = undefined
		}
	}
}
