import { CheckCircle2, Circle, Download } from "lucide-react"
import type { CodebaseMemoryStatus } from "@shared/proto/cline/codebase_memory"

interface StatusCardProps {
	status?: CodebaseMemoryStatus
	onDownload?: () => void
	isDownloading?: boolean
}

export default function StatusCard({ status, onDownload, isDownloading }: StatusCardProps) {
	const rows = [
		{
			label: "Binary",
			value: status?.binaryInstalled
				? `installed${status.binaryVersion ? ` (${status.binaryVersion})` : ""}`
				: "not installed",
			ok: status?.binaryInstalled,
		},
		{
			label: "Project",
			value: status?.isIndexed
				? `indexed — ${status.indexedNodeCount ?? 0} nodes, ${status.indexedEdgeCount ?? 0} edges`
				: "not indexed",
			ok: status?.isIndexed,
		},
		{
			label: "MCP tools",
			value: status?.mcpServerRegistered ? "registered for agent" : "not registered",
			ok: status?.mcpServerRegistered,
		},
		{
			label: "Graph UI",
			value: status?.graphServerRunning ? "running" : "not running",
			ok: status?.graphServerRunning,
		},
	]

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Status</div>
			<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
				{rows.map((row) => (
					<div key={row.label} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
						{row.ok ? (
							<CheckCircle2 style={{ color: "var(--vscode-testing-iconPassed)", width: "14px" }} />
						) : (
							<Circle style={{ color: "var(--vscode-descriptionForeground)", width: "14px" }} />
						)}
						<span style={{ color: "var(--vscode-descriptionForeground)", minWidth: "70px" }}>{row.label}:</span>
						<span style={{ color: "var(--vscode-foreground)" }}>{row.value}</span>
						{row.label === "Binary" && !status?.binaryInstalled && onDownload && (
							<button
								onClick={onDownload}
								disabled={isDownloading}
								style={{
									marginLeft: "auto",
									padding: "2px 8px",
									fontSize: "11px",
									cursor: isDownloading ? "not-allowed" : "pointer",
									background: "var(--vscode-button-background)",
									color: "var(--vscode-button-foreground)",
									border: "none",
									borderRadius: "3px",
									display: "flex",
									alignItems: "center",
									gap: "4px",
									opacity: isDownloading ? 0.7 : 1,
								}}>
								<Download style={{ width: "12px", height: "12px" }} />
								{isDownloading ? "Installing..." : "Install"}
							</button>
						)}
					</div>
				))}
			</div>
		</div>
	)
}
