import { EmptyRequest } from "@shared/proto/cline/common"
import {
	CrawlUrlRequest,
	type GetDocsIndexSettingsResponse,
	TaskStatusRequest,
	type TaskStatusResponse,
	UpdateDocsIndexSettingsRequest,
} from "@shared/proto/cline/docs_index"
import { useCallback, useEffect, useRef, useState } from "react"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface IndexCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
	workspacePath?: string
}

export default function IndexCard({ serverUrl, connected, selectedProject, workspacePath = "" }: IndexCardProps) {
	const [urlInput, setUrlInput] = useState("")
	const [maxDepth, setMaxDepth] = useState(3)
	const [maxPages, setMaxPages] = useState(50)
	const [error, setError] = useState<string | null>(null)
	const [task, setTask] = useState<TaskStatusResponse | null>(null)
	const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const disabled = !connected || !selectedProject || activeTaskId !== null

	const stopPolling = useCallback(() => {
		if (pollRef.current) clearInterval(pollRef.current)
		pollRef.current = null
		setActiveTaskId(null)
	}, [])

	// Stop polling if this card unmounts (e.g. navigating away from the docs-index
	// settings tab) while a crawl task is still in flight. Without this the 2s
	// interval keeps firing forever, holding the component + serverUrl closure and
	// hammering getTask on the docindex server.
	useEffect(() => {
		return () => stopPolling()
	}, [stopPolling])

	// Self-load crawl defaults from settings (depth/pages live in docs_index.json).
	useEffect(() => {
		let cancelled = false
		;(async () => {
			try {
				const s: GetDocsIndexSettingsResponse = await DocsIndexServiceClient.getDocsIndexSettings(EmptyRequest.create())
				if (cancelled) return
				if (s.crawlMaxDepth) setMaxDepth(s.crawlMaxDepth)
				if (s.crawlMaxPages) setMaxPages(s.crawlMaxPages)
			} catch {
				/* defaults are fine */
			}
		})()
		return () => {
			cancelled = true
		}
	}, [])

	const persistSetting = async (patch: { crawlMaxDepth?: number; crawlMaxPages?: number }) => {
		try {
			await DocsIndexServiceClient.updateDocsIndexSettings(
				UpdateDocsIndexSettingsRequest.create({ workspacePath, ...patch }),
			)
		} catch (err) {
			setError(`Save setting failed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	const startPolling = (taskId: string) => {
		stopPolling()
		setActiveTaskId(taskId)
		setTask(null)
		const poll = async () => {
			try {
				const t = await DocsIndexServiceClient.getTask(TaskStatusRequest.create({ serverUrl, taskId }))
				setTask(t)
				if (t.status === "done" || t.status === "failed") stopPolling()
			} catch (err) {
				setError(`Poll failed: ${err instanceof Error ? err.message : String(err)}`)
				stopPolling()
			}
		}
		poll()
		pollRef.current = setInterval(poll, 2000)
	}

	const handleCrawl = async () => {
		setError(null)
		setTask(null)
		if (maxDepth < 0 || maxPages < 1) {
			setError("Depth must be ≥ 0 and max pages ≥ 1.")
			return
		}
		try {
			const res = await DocsIndexServiceClient.crawlUrl(
				CrawlUrlRequest.create({
					serverUrl,
					project: selectedProject,
					url: urlInput,
					maxDepth,
					maxPages,
				}),
			)
			if (res.taskId) startPolling(res.taskId)
			else setError("Server did not return a task id")
		} catch (err) {
			setError(`Crawl failed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	const pct = task ? Math.round((task.progress || 0) * 100) : 0
	const inputStyle = {
		width: "5rem",
		padding: "4px 8px",
		fontSize: "12px",
		background: "var(--vscode-input-background)",
		color: "var(--vscode-input-foreground)",
		border: "1px solid var(--vscode-input-border)",
		borderRadius: "3px",
	} as const

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: disabled && !activeTaskId ? 0.5 : 1,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Crawl a URL</div>
			<div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
				<input
					disabled={disabled}
					onChange={(e) => setUrlInput(e.target.value)}
					placeholder="https://example.com"
					style={{
						flex: 1,
						padding: "4px 8px",
						fontSize: "12px",
						background: "var(--vscode-input-background)",
						color: "var(--vscode-input-foreground)",
						border: "1px solid var(--vscode-input-border)",
						borderRadius: "3px",
					}}
					type="text"
					value={urlInput}
				/>
				<button
					disabled={disabled || !urlInput}
					onClick={handleCrawl}
					style={{
						padding: "4px 12px",
						fontSize: "12px",
						background: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
						border: "none",
						borderRadius: "3px",
						cursor: disabled || !urlInput ? "not-allowed" : "pointer",
					}}>
					{activeTaskId ? "Crawling…" : "Crawl URL"}
				</button>
			</div>
			<div
				style={{
					display: "flex",
					gap: "12px",
					alignItems: "center",
					fontSize: "12px",
					color: "var(--vscode-descriptionForeground)",
				}}>
				<label>
					Depth{" "}
					<input
						disabled={disabled}
						min={0}
						onChange={(e) => {
							const v = Math.max(0, Number(e.target.value || 0))
							setMaxDepth(v)
							persistSetting({ crawlMaxDepth: v })
						}}
						style={inputStyle}
						type="number"
						value={maxDepth}
					/>
				</label>
				<label>
					Max pages{" "}
					<input
						disabled={disabled}
						min={1}
						onChange={(e) => {
							const v = Math.max(1, Number(e.target.value || 1))
							setMaxPages(v)
							persistSetting({ crawlMaxPages: v })
						}}
						style={inputStyle}
						type="number"
						value={maxPages}
					/>
				</label>
			</div>

			{task && (
				<div
					style={{
						marginTop: "8px",
						fontSize: "12px",
						color:
							task.status === "failed"
								? "var(--vscode-errorForeground)"
								: task.status === "done"
									? "var(--vscode-testing-iconPassed)"
									: "var(--vscode-descriptionForeground)",
					}}>
					{task.status === "done"
						? `Done — ${task.message || "crawled"}`
						: task.status === "failed"
							? `Failed: ${task.detail || task.message || "unknown error"}`
							: `${task.status} ${pct}% — ${task.message || ""}`}
				</div>
			)}
			{error && <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--vscode-errorForeground)" }}>{error}</div>}
		</div>
	)
}
