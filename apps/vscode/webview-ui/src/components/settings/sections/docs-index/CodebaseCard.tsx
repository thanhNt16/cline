import { useCallback, useEffect, useRef, useState } from "react"
import {
	GetCodebaseWatchRequest,
	IndexCodebaseRequest,
	StartCodebaseWatchRequest,
	type CodebaseWatchStatus,
	TaskStatusRequest,
	type TaskStatusResponse,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface CodebaseCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function CodebaseCard({ serverUrl, connected, selectedProject }: CodebaseCardProps) {
	const [pathInput, setPathInput] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [watchError, setWatchError] = useState<string | null>(null)
	const [task, setTask] = useState<TaskStatusResponse | null>(null)
	const [watch, setWatch] = useState<CodebaseWatchStatus | null>(null)
	const [debounceSecs, setDebounceSecs] = useState(5)
	const [busy, setBusy] = useState(false)
	const [watchBusy, setWatchBusy] = useState(false)
	const activeTaskId = useRef<string | null>(null)
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const indexDisabled = !connected || !selectedProject || busy

	const stopPolling = useCallback(() => {
		if (pollRef.current) clearInterval(pollRef.current)
		pollRef.current = null
		activeTaskId.current = null
	}, [])

	useEffect(() => stopPolling, [stopPolling])

	const startPolling = useCallback(
		(taskId: string) => {
			stopPolling()
			activeTaskId.current = taskId
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
		},
		[serverUrl, stopPolling],
	)

	// Refresh watcher status on mount / project change. active:false is the normal
	// "no watcher" state, not an error — only surface status.error.
	const refreshWatch = useCallback(() => {
		if (!connected || !selectedProject) {
			setWatch(null)
			return
		}
		DocsIndexServiceClient.getCodebaseWatch(GetCodebaseWatchRequest.create({ serverUrl, project: selectedProject }))
			.then((w) => {
				setWatch(w)
				setWatchError(w.error || null)
			})
			.catch((e) => setWatchError(e instanceof Error ? e.message : String(e)))
	}, [serverUrl, connected, selectedProject])

	useEffect(() => {
		refreshWatch()
	}, [refreshWatch])

	const handleIndex = async () => {
		setError(null)
		setWatchError(null)
		setBusy(true)
		try {
			const res = await DocsIndexServiceClient.indexCodebase(
				IndexCodebaseRequest.create({ serverUrl, project: selectedProject, path: pathInput }),
			)
			if (res.status === "error") {
				setError(res.error || "Index failed")
			} else if (res.taskId) {
				startPolling(res.taskId)
			} else {
				setError("Server did not return a task id")
			}
		} catch (err) {
			setError(`Index codebase failed: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setBusy(false)
		}
	}

	// A successful (or in-progress) index implies a binding now exists, so watching
	// becomes allowed. Falls back to any known active watcher.
	const canWatch = connected && !!selectedProject && (!!task || !!watch?.active)

	const handleToggleWatch = async (enable: boolean) => {
		if (!selectedProject) return
		setWatchError(null)
		setWatchBusy(true)
		try {
			if (enable) {
				const path = pathInput || watch?.path || ""
				if (!path) {
					setWatchError("Enter a codebase path before enabling the watcher.")
					return
				}
				const w = await DocsIndexServiceClient.startCodebaseWatch(
					StartCodebaseWatchRequest.create({ serverUrl, project: selectedProject, path, debounceSecs }),
				)
				setWatch(w)
				setWatchError(w.error || null)
			} else {
				const w = await DocsIndexServiceClient.stopCodebaseWatch(
					GetCodebaseWatchRequest.create({ serverUrl, project: selectedProject }),
				)
				setWatch(w)
				setWatchError(w.error || null)
			}
		} catch (err) {
			setWatchError(err instanceof Error ? err.message : String(err))
		} finally {
			setWatchBusy(false)
		}
	}

	const pct = task ? Math.round((task.progress || 0) * 100) : 0

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: !connected ? 0.5 : 1,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Remote Codebase Indexing</div>
			<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
				Bind this project to a codebase folder on the docindex server host and index it structurally
				(codebase-memory-mcp). The path is resolved on the server, not this machine.
			</div>
			<div style={{ display: "flex", gap: "6px" }}>
				<input
					type="text"
					value={pathInput}
					onChange={(e) => setPathInput(e.target.value)}
					placeholder="/absolute/path/on/server"
					disabled={indexDisabled}
					style={{
						flex: 1,
						padding: "4px 8px",
						fontSize: "12px",
						fontFamily: "monospace",
						background: "var(--vscode-input-background)",
						color: "var(--vscode-input-foreground)",
						border: "1px solid var(--vscode-input-border)",
						borderRadius: "3px",
					}}
				/>
				<button
					onClick={handleIndex}
					disabled={indexDisabled || !pathInput}
					style={{
						padding: "4px 12px",
						fontSize: "12px",
						background: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
						border: "none",
						borderRadius: "3px",
						cursor: indexDisabled || !pathInput ? "not-allowed" : "pointer",
					}}>
					{activeTaskId.current ? "Indexing..." : "Index"}
				</button>
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
						? `Done — ${task.message || "indexed"}`
						: task.status === "failed"
							? `Failed: ${task.detail || task.message || "unknown error"}`
							: `${task.status} ${pct}% — ${task.message || ""}`}
				</div>
			)}
			{error && (
				<div style={{ marginTop: "8px", fontSize: "12px", color: "var(--vscode-errorForeground)" }}>{error}</div>
			)}

			{/* Watcher */}
			<div
				style={{
					marginTop: "12px",
					paddingTop: "10px",
					borderTop: "1px solid var(--vscode-panel-border)",
				}}>
				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: "6px",
						fontSize: "12px",
						color: "var(--vscode-foreground)",
						cursor: canWatch && !watchBusy ? "pointer" : "not-allowed",
						opacity: canWatch ? 1 : 0.6,
					}}>
					<input
						type="checkbox"
						checked={!!watch?.active}
						disabled={!canWatch || watchBusy}
						onChange={(e) => handleToggleWatch(e.target.checked)}
						style={{ cursor: canWatch ? "pointer" : "not-allowed" }}
					/>
					Auto re-index on file change
				</label>
				<label
					style={{
						display: canWatch ? "flex" : "none",
						alignItems: "center",
						gap: "6px",
						fontSize: "12px",
						marginTop: "6px",
						marginLeft: "22px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					debounce (s, min 5)
					<input
						type="number"
						min={5}
						value={debounceSecs}
						onChange={(e) => setDebounceSecs(Math.max(5, Number(e.target.value) || 5))}
						disabled={!canWatch || watchBusy || !watch?.active}
						style={{
							width: "60px",
							padding: "2px 6px",
							fontSize: "12px",
							background: "var(--vscode-input-background)",
							color: "var(--vscode-input-foreground)",
							border: "1px solid var(--vscode-input-border)",
							borderRadius: "3px",
						}}
					/>
				</label>
				{watch?.active && (
					<div
						style={{
							marginTop: "6px",
							marginLeft: "22px",
							fontSize: "11px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						Watching{watch.path ? `: ${watch.path}` : ""}
						{watch.debounceSecs ? ` · ${watch.debounceSecs}s` : ""}
						{watch.lastIndex ? ` · last index ${watch.lastIndex}` : ""}
					</div>
				)}
				{!canWatch && (
					<div
						style={{
							marginTop: "6px",
							marginLeft: "22px",
							fontSize: "11px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						Index the project once before enabling the watcher.
					</div>
				)}
				{watchError && (
					<div
						style={{
							marginTop: "6px",
							marginLeft: "22px",
							fontSize: "11px",
							color: "var(--vscode-errorForeground)",
						}}>
						{watchError}
					</div>
				)}
			</div>
		</div>
	)
}
