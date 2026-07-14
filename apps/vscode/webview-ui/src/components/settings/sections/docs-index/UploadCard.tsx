import { useState } from "react"
import { UploadFileRequest, type UploadFileResponse } from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface UploadCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function UploadCard({ serverUrl, connected, selectedProject }: UploadCardProps) {
	const [uploading, setUploading] = useState(false)
	const [result, setResult] = useState<UploadFileResponse | undefined>()
	const [error, setError] = useState<string | null>(null)

	const handleUpload = async () => {
		setUploading(true)
		setError(null)
		setResult(undefined)
		try {
			const response = await DocsIndexServiceClient.uploadFile(
				UploadFileRequest.create({ serverUrl, project: selectedProject }),
			)
			setResult(response)
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
				onClick={handleUpload}
				disabled={disabled || uploading}
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
			{result && (
				<div
					style={{
						marginTop: "8px",
						fontSize: "12px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					{result.status === "cancelled" ? (
						"Upload cancelled"
					) : (
						<>
							Uploaded <strong>{result.filename}</strong> ({(result.size / 1024).toFixed(1)} KB) — {result.status}
						</>
					)}
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
