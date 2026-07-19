import { useRef, useState } from "react"
import {
	IndexUrlRequest,
	TaskStatusRequest,
	type TaskStatusResponse,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface IndexCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function IndexCard({ serverUrl, connected, selectedProject }: IndexCardProps) {
	const [urlInput, setUrlInput] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [task, setTask] = useState<TaskStatusResponse | null>(null)
	const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const disabled = !connected || !selectedProject || activeTaskId !== null

	const stopPolling = () => {
		if (pollRef.current) clearInterval(pollRef.current)
		pollRef.current = null
		setActiveTaskId(null)
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

	const handleIndexUrl = async () => {
		setError(null)
		setTask(null)
		try {
			const res = await DocsIndexServiceClient.indexUrl(
				IndexUrlRequest.create({ serverUrl, project: selectedProject, url: urlInput }),
			)
			if (res.taskId) startPolling(res.taskId)
			else setError("Server did not return a task id")
		} catch (err) {
			setError(`Index URL failed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	const pct = task ? Math.round((task.progress || 0) * 100) : 0

	return (
		<div style={{ border: "1px solid var(--vscode-panel-border)", borderRadius: "4px", padding: "12px 16px", opacity: disabled && !activeTaskId ? 0.5 : 1 }}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Index a URL</div>
			<div style={{ display: "flex", gap: "6px" }}>
				<input
					type="text"
					value={urlInput}
					onChange={(e) => setUrlInput(e.target.value)}
					placeholder="https://example.com/page"
					disabled={disabled}
					style={{ flex: 1, padding: "4px 8px", fontSize: "12px", background: "var(--vscode-input-background)", color: "var(--vscode-input-foreground)", border: "1px solid var(--vscode-input-border)", borderRadius: "3px" }}
				/>
				<button
					onClick={handleIndexUrl}
					disabled={disabled || !urlInput}
					style={{ padding: "4px 12px", fontSize: "12px", background: "var(--vscode-button-background)", color: "var(--vscode-button-foreground)", border: "none", borderRadius: "3px", cursor: disabled || !urlInput ? "not-allowed" : "pointer" }}>
					{activeTaskId ? "Indexing..." : "Index URL"}
				</button>
			</div>

			{task && (
				<div style={{ marginTop: "8px", fontSize: "12px", color: task.status === "failed" ? "var(--vscode-errorForeground)" : task.status === "done" ? "var(--vscode-testing-iconPassed)" : "var(--vscode-descriptionForeground)" }}>
					{task.status === "done"
						? `Done — ${task.message || "indexed"}`
						: task.status === "failed"
							? `Failed: ${task.detail || task.message || "unknown error"}`
							: `${task.status} ${pct}% — ${task.message || ""}`}
				</div>
			)}

			{error && <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--vscode-errorForeground)" }}>{error}</div>}
		</div>
	)
}
