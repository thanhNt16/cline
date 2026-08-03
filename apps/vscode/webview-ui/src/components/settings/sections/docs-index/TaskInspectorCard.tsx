import { useCallback, useEffect, useRef, useState } from "react"
import { TaskStatusRequest, type TaskStatusResponse } from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface TaskInspectorCardProps {
	serverUrl: string
	connected: boolean
}

export default function TaskInspectorCard({ serverUrl, connected }: TaskInspectorCardProps) {
	const [taskId, setTaskId] = useState("")
	const [task, setTask] = useState<TaskStatusResponse | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const taskIdRef = useRef<string | null>(null)

	const stopPolling = useCallback(() => {
		if (pollingRef.current !== null) {
			clearInterval(pollingRef.current)
			pollingRef.current = null
		}
	}, [])

	useEffect(() => {
		return () => stopPolling()
	}, [stopPolling])

	const inspectTask = async (id: string) => {
		if (!id.trim()) return

		stopPolling()
		setLoading(true)
		setError(null)
		setTask(null)
		taskIdRef.current = id

		try {
			// First poll immediately
			const status = await DocsIndexServiceClient.getTask(
				TaskStatusRequest.create({ serverUrl, taskId: id }),
			)
			setTask(status)

			// Continue polling every 1s
			const poll = async () => {
				if (taskIdRef.current !== id) return
				try {
					const s = await DocsIndexServiceClient.getTask(
						TaskStatusRequest.create({ serverUrl, taskId: id }),
					)
					setTask(s)
					if (s.status === "done" || s.status === "failed") {
						stopPolling()
					}
				} catch {
					// keep polling on transient errors
				}
			}

			pollingRef.current = setInterval(poll, 1000)
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setLoading(false)
		}
	}

	const handleInspect = () => inspectTask(taskId.trim())

	const pct = task ? Math.round((task.progress || 0) * 100) : 0

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: !connected ? 0.5 : 1,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Task Inspector</div>
			<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
				Look up any indexing task by ID and watch its live progress.
			</div>
			<div style={{ display: "flex", gap: "6px" }}>
				<input
					type="text"
					value={taskId}
					onChange={(e) => setTaskId(e.target.value)}
					placeholder="task-uuid"
					disabled={!connected || loading}
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
					onClick={handleInspect}
					disabled={!connected || loading || !taskId.trim()}
					style={{
						padding: "4px 12px",
						fontSize: "12px",
						background: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
						border: "none",
						borderRadius: "3px",
						cursor: !connected || loading || !taskId.trim() ? "not-allowed" : "pointer",
					}}>
					{loading ? "Loading..." : "Inspect"}
				</button>
			</div>

			{task && (
				<div style={{ marginTop: "8px", fontSize: "12px" }}>
					<div
						style={{
							background: "var(--vscode-editor-background)",
							border: "1px solid var(--vscode-panel-border)",
							borderRadius: "3px",
							padding: "8px",
							fontFamily: "monospace",
							whiteSpace: "pre-wrap",
							lineHeight: 1.5,
						}}>
						{[
							`ID:      ${task.id}`,
							`Project: ${task.project}`,
							`Status:  ${task.status}`,
							`Progress:${pct}%`,
							task.message ? `Message: ${task.message}` : null,
							task.detail ? `Detail:  ${task.detail}` : null,
						]
							.filter(Boolean)
							.join("\n")}
					</div>
					{task.status !== "done" && task.status !== "failed" && (
						<div
							style={{
								marginTop: "6px",
								height: "4px",
								background: "var(--vscode-editor-background)",
								borderRadius: "2px",
								overflow: "hidden",
							}}>
							<div
								style={{
									width: `${pct}%`,
									height: "100%",
									background:
										task.status === "failed"
											? "var(--vscode-errorForeground)"
											: "var(--vscode-testing-iconPassed)",
									borderRadius: "2px",
									transition: "width 0.3s ease",
								}}
							/>
						</div>
					)}
					{pollingRef.current && (
						<div
							style={{
								marginTop: "4px",
								fontSize: "11px",
								color: "var(--vscode-testing-iconPassed)",
							}}>
							● Live
						</div>
					)}
				</div>
			)}

			{error && (
				<div style={{ marginTop: "8px", fontSize: "12px", color: "var(--vscode-errorForeground)" }}>{error}</div>
			)}
		</div>
	)
}
