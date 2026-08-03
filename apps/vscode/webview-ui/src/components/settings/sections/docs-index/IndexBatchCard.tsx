import { useCallback, useEffect, useRef, useState } from "react"
import { IndexBatchRequest, TaskStatusRequest, type TaskStatusResponse } from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface IndexBatchCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function IndexBatchCard({ serverUrl, connected, selectedProject }: IndexBatchCardProps) {
	const [indexing, setIndexing] = useState(false)
	const [task, setTask] = useState<TaskStatusResponse | null>(null)
	const [error, setError] = useState<string | null>(null)
	const disabled = !connected || !selectedProject
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

	const handleIndexProject = async () => {
		setIndexing(true)
		setError(null)
		setTask(null)
		stopPolling()
		taskIdRef.current = null

		try {
			const res = await DocsIndexServiceClient.indexBatch(
				IndexBatchRequest.create({ serverUrl, project: selectedProject }),
			)
			if (!res.taskId) {
				setError("No task ID returned")
				setIndexing(false)
				return
			}

			taskIdRef.current = res.taskId
			setIndexing(false)

			// Poll task status via gRPC bridge every 1s
			const poll = async () => {
				if (!taskIdRef.current) return
				try {
					const status = await DocsIndexServiceClient.getTask(
						TaskStatusRequest.create({ serverUrl, taskId: taskIdRef.current }),
					)
					setTask(status)
					if (status.status === "done" || status.status === "failed") {
						stopPolling()
					}
				} catch {
					// keep polling on transient errors
				}
			}

			// Immediate first poll
			await poll()
			pollingRef.current = setInterval(poll, 1000)
		} catch (err) {
			setError(`Re-index failed: ${err instanceof Error ? err.message : String(err)}`)
			setIndexing(false)
		}
	}

	const pct = task ? Math.round((task.progress || 0) * 100) : 0
	const isActive = task && task.status !== "done" && task.status !== "failed"
	const isError = task?.status === "failed"

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: disabled ? 0.5 : 1,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Index Project</div>
			<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
				Re-run the indexing pipeline on all previously uploaded documents for this project.
			</div>
			<button
				onClick={handleIndexProject}
				disabled={disabled || indexing || !!isActive}
				style={{
					padding: "4px 12px",
					fontSize: "12px",
					cursor: disabled || indexing || isActive ? "not-allowed" : "pointer",
					background: "var(--vscode-button-background)",
					color: "var(--vscode-button-foreground)",
					border: "none",
					borderRadius: "3px",
					opacity: disabled || indexing || isActive ? 0.7 : 1,
				}}>
				{isActive ? "Indexing..." : indexing ? "Starting..." : "Re-index All Documents"}
			</button>

			{task && (
				<div style={{ marginTop: "10px", fontSize: "12px" }}>
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
							`Status:   ${task.status}`,
							task.message ? `Progress: ${task.message}` : `Progress: ${pct}%`,
						]
							.filter(Boolean)
							.join("\n")}
					</div>
					{(isActive || isError) && (
						<div
							style={{
								marginTop: "6px",
								height: "6px",
								background: "var(--vscode-editor-background)",
								borderRadius: "3px",
								overflow: "hidden",
							}}>
							<div
								style={{
									width: `${pct}%`,
									height: "100%",
									background: isError
										? "var(--vscode-errorForeground)"
										: "var(--vscode-testing-iconPassed)",
									borderRadius: "3px",
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
					{!isActive && task.status === "done" && (
						<div
							style={{
								marginTop: "4px",
								fontSize: "11px",
								color: "var(--vscode-testing-iconPassed)",
							}}>
							✓ Complete
						</div>
					)}
					{!isActive && task.status === "failed" && (
						<div
							style={{
								marginTop: "4px",
								fontSize: "11px",
								color: "var(--vscode-errorForeground)",
							}}>
							✗ Failed{task.detail ? `: ${task.detail}` : ""}
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
