import { UploadFileRequest } from "@shared/proto/cline/docs_index"
import { useState } from "react"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface UploadCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
	onUploaded: () => void
}

export default function UploadCard({ serverUrl, connected, selectedProject, onUploaded }: UploadCardProps) {
	const [uploading, setUploading] = useState(false)
	const [status, setStatus] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const handleUpload = async () => {
		setUploading(true)
		setError(null)
		setStatus(null)
		try {
			const res = await DocsIndexServiceClient.uploadFile(UploadFileRequest.create({ serverUrl, project: selectedProject }))
			setStatus(res.taskId ? `Uploaded — indexing task ${res.taskId}` : `Status: ${res.status}`)
			if (res.taskId) onUploaded()
		} catch (err) {
			setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setUploading(false)
		}
	}

	const disabled = !connected || !selectedProject

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: disabled ? 0.5 : 1,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Upload Document</div>
			<button
				disabled={disabled || uploading}
				onClick={handleUpload}
				style={{
					padding: "4px 12px",
					fontSize: "12px",
					cursor: disabled || uploading ? "not-allowed" : "pointer",
					background: "var(--vscode-button-background)",
					color: "var(--vscode-button-foreground)",
					border: "none",
					borderRadius: "3px",
					opacity: disabled || uploading ? 0.7 : 1,
				}}>
				{uploading ? "Uploading..." : "Upload File"}
			</button>
			{status && (
				<div
					style={{
						marginTop: "8px",
						fontSize: "12px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					{status}
				</div>
			)}
			{error && (
				<div
					style={{
						marginTop: "8px",
						fontSize: "12px",
						color: "var(--vscode-errorForeground)",
					}}>
					{error}
				</div>
			)}
		</div>
	)
}
