import { ExternalLink, Square } from "lucide-react"
import type { CodebaseMemoryStatus } from "@shared/proto/cline/codebase_memory"
import { Button } from "@/components/ui/button"

interface GraphCardProps {
	status?: CodebaseMemoryStatus
	isOpeningGraph: boolean
	onViewGraph: () => void
	onStopGraph: () => void
}

export default function GraphCard({ status, isOpeningGraph, onViewGraph, onStopGraph }: GraphCardProps) {
	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Graph</div>
			<div style={{ display: "flex", gap: "8px" }}>
				<Button onClick={onViewGraph} disabled={isOpeningGraph} variant="default" size="sm">
					<ExternalLink style={{ width: "14px", marginRight: "4px" }} />
					{isOpeningGraph ? "Opening..." : "View Graph in Browser"}
				</Button>
				{status?.graphServerRunning && (
					<Button onClick={onStopGraph} variant="secondary" size="sm">
						<Square style={{ width: "12px", marginRight: "4px" }} />
						Stop
					</Button>
				)}
			</div>
			<div
				style={{
					fontSize: "12px",
					color: "var(--vscode-descriptionForeground)",
					marginTop: "8px",
				}}>
				Opens the 3D graph visualization at localhost:9749 in your default browser.
				{status?.graphServerRunning && (
					<span style={{ color: "var(--vscode-testing-iconPassed)", marginLeft: "4px" }}>(running)</span>
				)}
			</div>
		</div>
	)
}
