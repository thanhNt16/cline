import { useEffect, useState } from "react"
import { EmptyRequest } from "@shared/proto/cline/common"
import type { CodebaseMemoryTool } from "@shared/proto/cline/codebase_memory"
import { CodebaseMemoryServiceClient } from "@/services/grpc-client"

export default function ToolsCard() {
	const [tools, setTools] = useState<CodebaseMemoryTool[]>([])

	useEffect(() => {
		CodebaseMemoryServiceClient.listTools(EmptyRequest.create({}))
			.then((response) => {
				setTools(response.tools ?? [])
			})
			.catch((e) => console.error("Failed to list tools:", e))
	}, [])

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Available MCP Tools ({tools.length})</div>
			<div
				style={{
					fontSize: "12px",
					color: "var(--vscode-descriptionForeground)",
					marginBottom: "8px",
				}}>
				These tools are available to your agent after indexing:
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
				{tools.map((tool) => (
					<div key={tool.name} style={{ fontSize: "12px", lineHeight: "1.4" }}>
						<span style={{ color: "var(--vscode-foreground)", fontWeight: 600 }}>{tool.name}</span>
						<span style={{ color: "var(--vscode-descriptionForeground)" }}> — {tool.description}</span>
					</div>
				))}
			</div>
		</div>
	)
}
