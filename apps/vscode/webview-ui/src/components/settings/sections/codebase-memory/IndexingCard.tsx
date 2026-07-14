import { useEffect, useRef } from "react"
import type { CodebaseMemoryStatus, IndexProgressEvent } from "@shared/proto/cline/codebase_memory"
import { Button } from "@/components/ui/button"

interface IndexingCardProps {
	status?: CodebaseMemoryStatus
	isIndexing: boolean
	progressLines: IndexProgressEvent[]
	onIndex: () => void
	onReindex: () => void
	hasWorkspace: boolean
}

export default function IndexingCard({ status, isIndexing, progressLines, onIndex, onReindex, hasWorkspace }: IndexingCardProps) {
	const logRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (logRef.current) {
			logRef.current.scrollTop = logRef.current.scrollHeight
		}
	}, [progressLines])

	const colorForLevel = (level: number): string => {
		switch (level) {
			case 1:
				return "var(--vscode-editorWarning-foreground)"
			case 2:
				return "var(--vscode-editorError-foreground)"
			case 3:
				return "var(--vscode-testing-iconPassed)"
			default:
				return "var(--vscode-descriptionForeground)"
		}
	}

	const binaryInstalled = status?.binaryInstalled ?? false
	const canIndex = binaryInstalled && hasWorkspace && !isIndexing

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Indexing</div>
			<div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
				<Button onClick={onIndex} disabled={!canIndex} variant="default" size="sm">
					{isIndexing ? "Indexing..." : "Index Current Project"}
				</Button>
				<Button onClick={onReindex} disabled={isIndexing || !status?.isIndexed || !binaryInstalled} variant="outline" size="sm">
					Re-index
				</Button>
			</div>
			{!hasWorkspace && (
				<div
					style={{
						fontSize: "12px",
						color: "var(--vscode-descriptionForeground)",
						marginBottom: "8px",
					}}>
					Open a project folder to enable indexing.
				</div>
			)}
			{hasWorkspace && !binaryInstalled && (
				<div
					style={{
						fontSize: "12px",
						color: "var(--vscode-descriptionForeground)",
						marginBottom: "8px",
					}}>
					Install the binary to enable indexing.
				</div>
			)}
			{progressLines.length > 0 && (
				<div
					ref={logRef}
					style={{
						maxHeight: "200px",
						overflowY: "auto",
						background: "var(--vscode-textBlockQuote-background)",
						border: "1px solid var(--vscode-panel-border)",
						borderRadius: "3px",
						padding: "8px",
						fontFamily: "var(--vscode-editor-font-family)",
						fontSize: "11px",
						lineHeight: "1.4",
					}}>
					{progressLines.map((line, i) => (
						<div key={i} style={{ color: colorForLevel(line.level) }}>
							{line.message}
						</div>
					))}
				</div>
			)}
		</div>
	)
}
