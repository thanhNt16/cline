import { type DocumentInfo, ListDocumentsRequest } from "@shared/proto/cline/docs_index"
import { useCallback, useEffect, useState } from "react"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface DocumentsCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function DocumentsCard({ serverUrl, connected, selectedProject }: DocumentsCardProps) {
	const [documents, setDocuments] = useState<DocumentInfo[]>([])
	const [loading, setLoading] = useState(false)

	const reload = useCallback(async () => {
		if (!connected || !selectedProject) {
			setDocuments([])
			return
		}
		setLoading(true)
		try {
			const response = await DocsIndexServiceClient.listDocuments(
				ListDocumentsRequest.create({ serverUrl, project: selectedProject }),
			)
			setDocuments(response.documents ?? [])
		} catch (err) {
			console.error("Failed to list documents:", err)
			setDocuments([])
		} finally {
			setLoading(false)
		}
	}, [serverUrl, connected, selectedProject])

	useEffect(() => {
		reload()
	}, [reload])

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: connected ? 1 : 0.5,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Documents</div>
			<div style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
				Uploaded documents in <code>{selectedProject || "(select a project)"}</code>
			</div>
			{loading && <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>Loading…</div>}
			{!loading && documents.length === 0 && (
				<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>No documents uploaded.</div>
			)}
			{documents.length > 0 && (
				<ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
					{documents.map((doc) => (
						<li
							key={doc.source}
							style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
							<span
								style={{
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									marginRight: "8px",
								}}>
								{doc.source}
							</span>
							<a
								href="#"
								onClick={(e) => {
									e.preventDefault()
									window.open(
										`${serverUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(selectedProject)}/documents/${encodeURIComponent(doc.source)}/file`,
										"_blank",
									)
								}}
								style={{ color: "var(--vscode-textLink)", textDecoration: "none" }}>
								Download
							</a>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
