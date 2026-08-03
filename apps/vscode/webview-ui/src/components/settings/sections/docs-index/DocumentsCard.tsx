import { StringRequest } from "@shared/proto/cline/common"
import { type DocumentInfo, ListDocumentsRequest } from "@shared/proto/cline/docs_index"
import { useCallback, useEffect, useMemo, useState } from "react"
import { DocsIndexServiceClient, UiServiceClient } from "@/services/grpc-client"

const PAGE_SIZE = 5

interface DocumentsCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
	refreshSignal: number
}

export default function DocumentsCard({ serverUrl, connected, selectedProject, refreshSignal }: DocumentsCardProps) {
	const [documents, setDocuments] = useState<DocumentInfo[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")
	const [query, setQuery] = useState("")
	const [visible, setVisible] = useState(PAGE_SIZE)

	const reload = useCallback(async () => {
		if (!connected || !selectedProject) {
			setDocuments([])
			return
		}
		setLoading(true)
		setError("")
		try {
			const response = await DocsIndexServiceClient.listDocuments(
				ListDocumentsRequest.create({ serverUrl, project: selectedProject }),
			)
			setDocuments(response.documents ?? [])
		} catch (err) {
			console.error("Failed to list documents:", err)
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setLoading(false)
		}
	}, [serverUrl, connected, selectedProject])

	useEffect(() => {
		reload()
	}, [reload, refreshSignal])

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (!q) return documents
		return documents.filter((d) => d.source.toLowerCase().includes(q))
	}, [documents, query])

	const shown = filtered.slice(0, visible)
	const hasMore = filtered.length > visible

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: connected ? 1 : 0.5,
			}}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: "8px",
				}}>
				<div style={{ fontSize: "13px", fontWeight: 600 }}>Documents</div>
				<button
					disabled={loading}
					onClick={reload}
					style={{
						background: "none",
						border: "none",
						color: "var(--vscode-textLink)",
						cursor: "pointer",
						fontSize: "12px",
						padding: 0,
					}}
					type="button">
					{loading ? "Refreshing…" : "Refresh"}
				</button>
			</div>
			<div style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
				Uploaded documents in <code>{selectedProject || "(select a project)"}</code>
			</div>
			<input
				onChange={(e) => {
					setQuery(e.target.value)
					setVisible(PAGE_SIZE)
				}}
				placeholder="Search by document name…"
				style={{
					width: "100%",
					boxSizing: "border-box",
					padding: "4px 8px",
					marginBottom: "8px",
					fontSize: "12px",
					background: "var(--vscode-input-background)",
					color: "var(--vscode-input-foreground)",
					border: "1px solid var(--vscode-input-border)",
					borderRadius: "3px",
				}}
				value={query}
			/>
			{loading && <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>Loading…</div>}
			{!loading && error && <div style={{ fontSize: "12px", color: "var(--vscode-errorForeground)" }}>{error}</div>}
			{!loading && !error && shown.length === 0 && (
				<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
					{query ? "No documents match your search." : "No documents uploaded."}
				</div>
			)}
			{shown.length > 0 && (
				<ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
					{shown.map((doc) => (
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
							<button
								onClick={(e) => {
									e.preventDefault()
									UiServiceClient.openUrl(
										StringRequest.create({
											value: `${serverUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(selectedProject)}/documents/${encodeURIComponent(doc.source)}/file`,
										}),
									).catch((err) => console.error("Failed to open download URL:", err))
								}}
								style={{
									background: "none",
									border: "none",
									color: "var(--vscode-textLink)",
									cursor: "pointer",
									fontSize: "12px",
									padding: 0,
								}}
								type="button">
								Download
							</button>
						</li>
					))}
				</ul>
			)}
			{hasMore && (
				<button
					onClick={() => setVisible((v) => v + PAGE_SIZE)}
					style={{
						background: "none",
						border: "none",
						color: "var(--vscode-textLink)",
						cursor: "pointer",
						fontSize: "12px",
						padding: "8px 0 0",
					}}
					type="button">
					Load more
				</button>
			)}
		</div>
	)
}
