import type { CodebaseMemoryStatus, IndexProgressEvent } from "@shared/proto/cline/codebase_memory"
import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

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

	const latest = [...progressLines].reverse().find((e) => e.phase !== undefined || e.percent !== undefined)
	const isDone = progressLines.some((e) => e.level === 3) // IndexProgressEvent_Level.DONE
	const phase = latest?.phase
	const percent = latest?.percent
	const filesDone = latest?.filesDone
	const filesTotal = latest?.filesTotal
	const showProgress = isIndexing || (isDone && progressLines.length > 0)

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Indexing</div>
			<div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
				<Button disabled={!canIndex} onClick={onIndex} size="sm" variant="default">
					{isIndexing ? "Indexing..." : "Index Current Project"}
				</Button>
				<Button
					disabled={isIndexing || !status?.isIndexed || !binaryInstalled}
					onClick={onReindex}
					size="sm"
					variant="outline">
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
			{showProgress && (phase !== undefined || percent !== undefined) && (
				<div style={{ marginBottom: "12px" }}>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							fontSize: "12px",
							marginBottom: "4px",
							color: "var(--vscode-foreground)",
						}}>
						<span>{phase ?? "Indexing…"}</span>
						<span style={{ color: "var(--vscode-descriptionForeground)" }}>
							{percent !== undefined ? `${percent}%` : ""}
							{filesTotal !== undefined ? `  ${filesDone}/${filesTotal} files` : ""}
						</span>
					</div>
					{percent !== undefined ? (
						<Progress aria-valuenow={percent} value={percent} />
					) : (
						<Progress aria-valuenow={undefined} className="animate-pulse" />
					)}
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
