import { useCallback, useEffect, useState } from "react"
import {
	DeleteDocumentRequest,
	ListDocumentsRequest,
	type DocumentInfo,
	type ListDocumentsResponse,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface DocumentsCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

const PAGE_SIZE = 20

export default function DocumentsCard({ serverUrl, connected, selectedProject }: DocumentsCardProps) {
	const [response, setResponse] = useState<ListDocumentsResponse | undefined>()
	const [loading, setLoading] = useState(false)
	const [page, setPage] = useState(1)
	const [deleting, setDeleting] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const refresh = useCallback(async () => {
		if (!connected || !selectedProject) return
		setLoading(true)
		setError(null)
		try {
			const result = await DocsIndexServiceClient.listDocuments(
				ListDocumentsRequest.create({ serverUrl, project: selectedProject, page, pageSize: PAGE_SIZE }),
			)
			setResponse(result)
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setLoading(false)
		}
	}, [serverUrl, connected, selectedProject, page])

	useEffect(() => {
		refresh()
	}, [refresh])

	const handleDelete = useCallback(
		async (doc: DocumentInfo) => {
			if (!doc.path) return
			setDeleting(doc.path)
			setError(null)
			try {
				await DocsIndexServiceClient.deleteDocument(
					DeleteDocumentRequest.create({ serverUrl, project: selectedProject, path: doc.path }),
				)
				await refresh()
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err))
			} finally {
				setDeleting(null)
			}
		},
		[serverUrl, selectedProject, refresh],
	)

	const documents = response?.documents ?? []
	const totalPages = response?.totalPages ?? 0
	const disabled = !connected || !selectedProject

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: disabled ? 0.5 : 1,
			}}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
				<div style={{ fontSize: "13px", fontWeight: 600 }}>Documents</div>
				<button
					onClick={refresh}
					disabled={disabled || loading}
					style={{
						padding: "2px 8px",
						fontSize: "11px",
						cursor: disabled || loading ? "not-allowed" : "pointer",
						background: "var(--vscode-button-secondaryBackground)",
						color: "var(--vscode-button-secondaryForeground)",
						border: "none",
						borderRadius: "3px",
					}}>
					{loading ? "Loading..." : "Refresh"}
				</button>
			</div>

			{response && (
				<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
					{response.total} document{response.total !== 1 ? "s" : ""} (page {response.page} of {totalPages || 1})
				</div>
			)}

			{documents.length === 0 && !loading && (
				<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
					{disabled ? "Connect to a server and select a project to view documents." : "No documents indexed yet."}
				</div>
			)}

			<div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: "8px" }}>
				{documents.map((doc) => (
					<div
						key={doc.path}
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: "4px 0",
							borderBottom: "1px solid var(--vscode-panel-border)",
							fontSize: "12px",
						}}>
						<div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
							<div style={{ fontWeight: 500 }}>{doc.fileType.toUpperCase() || "FILE"}</div>
							<div
								style={{
									color: "var(--vscode-descriptionForeground)",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}>
								{doc.path}
							</div>
							<div style={{ color: "var(--vscode-descriptionForeground)", fontSize: "11px" }}>
								{doc.chunks} chunks · {(doc.size / 1024).toFixed(1)} KB
							</div>
						</div>
						<button
							onClick={() => handleDelete(doc)}
							disabled={deleting === doc.path}
							style={{
								padding: "2px 8px",
								fontSize: "11px",
								cursor: deleting === doc.path ? "not-allowed" : "pointer",
								background: "var(--vscode-button-secondaryBackground)",
								color: "var(--vscode-button-secondaryForeground)",
								border: "none",
								borderRadius: "3px",
								opacity: deleting === doc.path ? 0.5 : 1,
							}}>
							{deleting === doc.path ? "Deleting..." : "Delete"}
						</button>
					</div>
				))}
			</div>

			{totalPages > 1 && (
				<div style={{ display: "flex", gap: "4px", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>
					<button
						onClick={() => setPage((p) => Math.max(1, p - 1))}
						disabled={page === 1 || loading}
						style={{
							padding: "2px 8px",
							fontSize: "11px",
							background: "var(--vscode-button-secondaryBackground)",
							color: "var(--vscode-button-secondaryForeground)",
							border: "none",
							borderRadius: "3px",
							cursor: page === 1 || loading ? "not-allowed" : "pointer",
						}}>
						Prev
					</button>
					<span style={{ color: "var(--vscode-descriptionForeground)" }}>
						Page {page} of {totalPages}
					</span>
					<button
						onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
						disabled={page === totalPages || loading}
						style={{
							padding: "2px 8px",
							fontSize: "11px",
							background: "var(--vscode-button-secondaryBackground)",
							color: "var(--vscode-button-secondaryForeground)",
							border: "none",
							borderRadius: "3px",
							cursor: page === totalPages || loading ? "not-allowed" : "pointer",
						}}>
						Next
					</button>
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
