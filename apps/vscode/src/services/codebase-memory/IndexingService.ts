import { type ChildProcess, spawn } from "node:child_process"
import { IndexProgressEvent, IndexProgressEvent_Level } from "@shared/proto/cline/codebase_memory"
import { INDEXING_NO_OUTPUT_TIMEOUT_MS } from "./constants"
import type { IndexingResult } from "./types"

// Extraction is the one phase the CLI reports per-file counts for; it occupies
// the 10→80 band of the overall bar. The surrounding phases advance the bar to
// fixed floors so it never stalls or jumps backward.
const EXTRACT_START_PCT = 10
const EXTRACT_SPAN_PCT = 70
const EXTRACT_PROGRESS_RE = /msg=parallel\.extract\.progress done=(\d+) total=(\d+)/

// Ordered phase markers → { human label, overall-percent floor when it starts }.
// Matched against raw CLI stderr lines (level=info msg=<marker> …).
const PHASE_MARKERS: Array<{ test: RegExp; label: string; floor: number }> = [
	{ test: /msg=pipeline\.discover\b/, label: "Discovering files", floor: 3 },
	{ test: /msg=pass\.start pass=structure\b/, label: "Building file structure", floor: 6 },
	{ test: /msg=parallel\.extract\.start\b/, label: "Extracting definitions", floor: EXTRACT_START_PCT },
	{ test: /msg=parallel\.extract\.done\b/, label: "Extracting definitions", floor: 80 },
	{ test: /msg=parallel\.registry\.start\b/, label: "Building registry", floor: 82 },
	{ test: /msg=parallel\.resolve\.start\b/, label: "Resolving calls & edges", floor: 85 },
	{ test: /msg=parallel\.resolve\.done\b/, label: "Resolving calls & edges", floor: 95 },
	{ test: /msg=pass\.start pass=semantic\b/, label: "Analyzing inheritance", floor: 96 },
	{ test: /msg=pass\.start pass=tests\b/, label: "Detecting tests", floor: 97 },
	{ test: /msg=pass\.start pass=calls\b/, label: "Linking calls", floor: 98 },
]

export type ProgressHandler = (event: IndexProgressEvent) => void

export class IndexingService {
	private currentProcess: ChildProcess | undefined
	private noOutputTimer: ReturnType<typeof setTimeout> | undefined
	private lastJsonLine: string | undefined
	private lastPercent = 0
	private currentPhase = ""

	constructor(
		private readonly binaryPath: () => string,
		private readonly progress: ProgressHandler,
		private readonly lastIndexedRepo: () => string | undefined,
	) {}

	async indexProject(repoPath: string): Promise<void> {
		this.lastJsonLine = undefined
		this.resetProgress()
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
		this.resetProgress()
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
			const child = spawn(bin, args, {
				stdio: ["pipe", "pipe", "pipe"],
				// Run in-process so the pipeline's progress logs reach our stderr. In the
				// CLI's default supervised mode the worker logs to a private file we never
				// see, so the bar would sit frozen. Crash isolation is recovered by the
				// supervised retry in runWithFallback (Task 3).
				env: { ...process.env, CBM_INDEX_SUPERVISOR: "0" },
			})
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
					if (source === "stderr") {
						this.handleStderrLine(line)
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
							phase: "Done",
							percent: 100,
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

	private resetProgress(): void {
		this.lastPercent = 0
		this.currentPhase = ""
	}

	private handleStderrLine(line: string): void {
		const trimmed = line.trim()
		if (!trimmed) return
		this.resetNoOutputTimer()

		// Surface genuine CLI errors verbatim.
		if (/level=error\b/.test(trimmed)) {
			this.progress(IndexProgressEvent.create({ level: IndexProgressEvent_Level.ERROR, message: trimmed }))
			return
		}

		// Measurable extraction progress → precise percent + file counters.
		const m = trimmed.match(EXTRACT_PROGRESS_RE)
		if (m) {
			const done = Number(m[1])
			const total = Number(m[2])
			const pct = total > 0 ? EXTRACT_START_PCT + Math.round((done / total) * EXTRACT_SPAN_PCT) : EXTRACT_START_PCT
			this.emitProgress("Extracting definitions", pct, done, total)
			return
		}

		// Phase transitions → label + floor.
		for (const p of PHASE_MARKERS) {
			if (p.test.test(trimmed)) {
				this.emitProgress(p.label, p.floor)
				return
			}
		}
		// Everything else (mem.init, per-file start/done, timings, memory budgets) is noise — drop it.
	}

	private emitProgress(phase: string, percent: number, filesDone?: number, filesTotal?: number): void {
		const clamped = Math.max(this.lastPercent, Math.min(percent, 99))
		this.lastPercent = clamped
		this.currentPhase = phase
		this.progress(
			IndexProgressEvent.create({
				level: IndexProgressEvent_Level.INFO,
				message: filesTotal !== undefined ? `${phase} — ${filesDone}/${filesTotal} files` : phase,
				phase,
				percent: clamped,
				filesDone,
				filesTotal,
			}),
		)
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
