import { useEffect, useState } from "react"
import { EmptyRequest } from "@shared/proto/cline/common"
import { type CodebaseToolInfo, type DocsIndexTool, ListCodebaseToolsRequest } from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface ToolsCardProps {
	serverUrl?: string
	connected?: boolean
}

export default function ToolsCard({ serverUrl, connected }: ToolsCardProps) {
	// Static document tools, always listed.
	const [docsTools, setDocsTools] = useState<DocsIndexTool[]>([])
	// Live codebase (CBM) catalog from GET /codebase/tools; empty while disconnected.
	const [codebaseTools, setCodebaseTools] = useState<CodebaseToolInfo[]>([])

	useEffect(() => {
		DocsIndexServiceClient.listDocsIndexTools(EmptyRequest.create({}))
			.then((response) => setDocsTools(response.tools ?? []))
			.catch((e) => console.error("Failed to list docs-index tools:", e))
	}, [])

	useEffect(() => {
		if (!serverUrl || !connected) {
			setCodebaseTools([])
			return
		}
		DocsIndexServiceClient.listCodebaseTools(ListCodebaseToolsRequest.create({ serverUrl }))
			.then((response) => setCodebaseTools(response.tools ?? []))
			.catch((e) => console.error("Failed to list codebase tools:", e))
	}, [serverUrl, connected])

	const readonly = codebaseTools.filter((t) => t.isReadonly)
	const mutating = codebaseTools.filter((t) => !t.isReadonly)

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
				Available MCP Tools ({docsTools.length + codebaseTools.length})
			</div>
			<div
				style={{
					fontSize: "12px",
					color: "var(--vscode-descriptionForeground)",
					marginBottom: "8px",
				}}>
				These tools are available to your agent after connecting:
			</div>

			{docsTools.length > 0 && (
				<>
					<SubHeader>Documents</SubHeader>
					{docsTools.map((tool) => (
						<ToolRow description={tool.description} key={tool.name} name={tool.name} />
					))}
				</>
			)}

			{readonly.length > 0 && (
				<>
					<SubHeader>Codebase (read-only) · {readonly.length}</SubHeader>
					{readonly.map((tool) => (
						<ToolRow description={tool.description} key={tool.name} name={tool.name} />
					))}
				</>
			)}

			{mutating.length > 0 && (
				<>
					<SubHeader>Codebase (admin) · {mutating.length}</SubHeader>
					{mutating.map((tool) => (
						<ToolRow description={tool.description} key={tool.name} name={tool.name} />
					))}
				</>
			)}
		</div>
	)
}

function SubHeader({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				fontSize: "11px",
				fontWeight: 600,
				textTransform: "uppercase",
				letterSpacing: "0.5px",
				color: "var(--vscode-descriptionForeground)",
				margin: "10px 0 4px",
			}}>
			{children}
		</div>
	)
}

function ToolRow({ name, description }: { name: string; description: string }) {
	return (
		<div style={{ fontSize: "12px", lineHeight: "1.4", marginBottom: "2px" }}>
			<span style={{ color: "var(--vscode-foreground)", fontWeight: 600 }}>{name}</span>
			<span style={{ color: "var(--vscode-descriptionForeground)" }}> — {description}</span>
		</div>
	)
}
