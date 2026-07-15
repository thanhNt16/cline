import { useRef, useState } from "react"
import {
	DocsIndexProjectRequest,
	IndexUrlRequest,
	PollIndexJobRequest,
	type PollIndexJobResponse,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface IndexCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

function formatDuration(ms: number): string {
	if (ms < 1000) return "0s"
	const seconds = Math.floor(ms / 1000)
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	const remainingSeconds = seconds % 60
	if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
	const hours = Math.floor(minutes / 60)
	const remainingMinutes = minutes % 60
	return `${hours}h ${remainingMinutes}m`
}

function computeProgress(job: PollIndexJobResponse): {
	percent: number
	elapsedMs: number
	etaMs: number | null
	ratePerSec: number | null
	processed: number
	total: number
} {
	const processed = job.filesIndexed + job.filesFailed
	const total = job.filesScanned || 0
	const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0

	const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : 0
	const finishedAt = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now()
	const elapsedMs = startedAt > 0 ? Math.max(0, finishedAt - startedAt) : 0

	const elapsedSec = elapsedMs / 1000
	const ratePerSec = elapsedSec > 0 && processed > 0 ? processed / elapsedSec : null

	const remaining = total - processed
	const etaMs = ratePerSec !== null && ratePerSec > 0 && remaining > 0 ? (remaining / ratePerSec) * 1000 : null

	return { percent, elapsedMs, etaMs, ratePerSec, processed, total }
}

export default function IndexCard({ serverUrl, connected, selectedProject }: IndexCardProps) {
	const [urlInput, setUrlInput] = useState("")
	const [depth, setDepth] = useState(3)
	const [maxPages, setMaxPages] = useState(50)
	const [error, setError] = useState<string | null>(null)
	const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const [activeJobId, setActiveJobId] = useState<string | null>(null)
	const [activeJobType, setActiveJobType] = useState<"project" | "url" | null>(null)
	const [jobProgress, setJobProgress] = useState<PollIndexJobResponse | null>(null)
	const [, setTick] = useState(0)

	const isJobActive = activeJobId !== null
	const disabled = !connected || !selectedProject || isJobActive

	const stopPolling = () => {
		if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current)
			pollIntervalRef.current = null
		}
		setActiveJobId(null)
		setActiveJobType(null)
	}

	const startPolling = (jobId: string, type: "project" | "url") => {
		stopPolling()
		setActiveJobId(jobId)
		setActiveJobType(type)
		setJobProgress(null)

		const poll = async () => {
			try {
				const job = await DocsIndexServiceClient.pollIndexJob(
					PollIndexJobRequest.create({ serverUrl, project: selectedProject, jobId }),
				)
				setJobProgress(job)
				if (job.status === "completed" || job.status === "failed") {
					stopPolling()
				}
			} catch (err) {
				setError(`Poll failed: ${err instanceof Error ? err.message : String(err)}`)
				stopPolling()
			}
		}

		poll()
		pollIntervalRef.current = setInterval(poll, 2000)

		// Live timer — update every second for elapsed time display
		const timerInterval = setInterval(() => {
			setTick((t) => t + 1)
			if (pollIntervalRef.current === null) {
				clearInterval(timerInterval)
			}
		}, 1000)
	}

	const handleIndexProject = async () => {
		setError(null)
		setJobProgress(null)
		try {
			const response = await DocsIndexServiceClient.indexDocsProject(
				DocsIndexProjectRequest.create({ serverUrl, project: selectedProject }),
			)
			if (response.jobId) {
				startPolling(response.jobId, "project")
			}
		} catch (err) {
			setError(`Index failed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	const handleIndexUrl = async () => {
		setError(null)
		setJobProgress(null)
		try {
			const response = await DocsIndexServiceClient.indexUrl(
				IndexUrlRequest.create({
					serverUrl,
					project: selectedProject,
					url: urlInput,
					depth,
					maxPages,
				}),
			)
			if (response.jobId) {
				startPolling(response.jobId, "url")
			}
		} catch (err) {
			setError(`URL index failed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	const renderProgressBar = (job: PollIndexJobResponse) => {
		const { percent, total } = computeProgress(job)
		if (total === 0) return null

		return (
			<div
				style={{
					marginTop: "6px",
					height: "6px",
					background: "var(--vscode-panel-border)",
					borderRadius: "3px",
					overflow: "hidden",
				}}>
				<div
					style={{
						width: `${percent}%`,
						height: "100%",
						background:
							job.status === "completed"
								? "var(--vscode-testing-iconPassed)"
								: job.status === "failed"
									? "var(--vscode-errorForeground)"
									: "var(--vscode-button-background)",
						transition: "width 0.5s ease",
						borderRadius: "3px",
					}}
				/>
			</div>
		)
	}

	const renderProgressInfo = (job: PollIndexJobResponse, isUrl: boolean) => {
		const { percent, elapsedMs, etaMs, ratePerSec, processed, total } = computeProgress(job)
		const label = isUrl ? "pages" : "files"

		if (job.status === "completed") {
			const totalMs = job.finishedAt
				? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
				: elapsedMs
			return (
				<div style={{ marginTop: "6px", fontSize: "12px", color: "var(--vscode-testing-iconPassed)" }}>
					Completed: {job.filesIndexed} {label} indexed ({job.chunksAdded} chunks
					{job.filesFailed > 0 ? `, ${job.filesFailed} failed` : ""}) in {formatDuration(totalMs)}
				</div>
			)
		}

		if (job.status === "failed") {
			return (
				<div style={{ marginTop: "6px", fontSize: "12px", color: "var(--vscode-errorForeground)" }}>
					Failed: {job.error || "unknown error"}
					{processed > 0 && ` (${processed} ${label} processed before failure)`}
				</div>
			)
		}

		// Running / queued
		const parts: string[] = []

		if (job.status === "queued") {
			parts.push("Queued...")
		} else {
			if (total > 0) {
				parts.push(`${processed}/${total} ${label} (${percent}%)`)
			} else {
				parts.push(`${processed} ${label} processed`)
			}
			parts.push(`${job.chunksAdded} chunks`)
			if (job.filesFailed > 0) {
				parts.push(`${job.filesFailed} failed`)
			}
		}

		if (elapsedMs > 0) {
			parts.push(`${formatDuration(elapsedMs)} elapsed`)
		}

		if (etaMs !== null && etaMs > 0) {
			parts.push(`~${formatDuration(etaMs)} remaining`)
		}

		if (ratePerSec !== null && ratePerSec > 0) {
			parts.push(`${ratePerSec.toFixed(1)} ${label}/s`)
		}

		return (
			<div style={{ marginTop: "6px", fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
				{parts.join(" · ")}
			</div>
		)
	}

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: disabled ? 0.5 : 1,
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Indexing</div>

			{/* Index Project */}
			<div style={{ marginBottom: "12px" }}>
				<button
					onClick={handleIndexProject}
					disabled={disabled}
					style={{
						padding: "4px 12px",
						fontSize: "12px",
						cursor: disabled ? "not-allowed" : "pointer",
						background: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
						border: "none",
						borderRadius: "3px",
						opacity: disabled ? 0.7 : 1,
					}}>
					{activeJobType === "project" ? "Indexing..." : "Index Project"}
				</button>
				{jobProgress && activeJobType === "project" && (
					<>
						{renderProgressBar(jobProgress)}
						{renderProgressInfo(jobProgress, false)}
					</>
				)}
			</div>

			{/* URL Indexing */}
			<div style={{ borderTop: "1px solid var(--vscode-panel-border)", paddingTop: "12px" }}>
				<div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>Index URL</div>
				<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
					<input
						type="text"
						value={urlInput}
						onChange={(e) => setUrlInput(e.target.value)}
						disabled={disabled}
						placeholder="https://example.com"
						style={{
							padding: "4px 8px",
							fontSize: "12px",
							background: "var(--vscode-input-background)",
							color: "var(--vscode-input-foreground)",
							border: "1px solid var(--vscode-input-border)",
							borderRadius: "3px",
						}}
					/>
					<div style={{ display: "flex", gap: "8px" }}>
						<label style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
							Depth:{" "}
							<input
								type="number"
								value={depth}
								onChange={(e) => setDepth(Number(e.target.value))}
								disabled={disabled}
								min={1}
								max={10}
								style={{ width: "40px", fontSize: "12px" }}
							/>
						</label>
						<label style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
							Max pages:{" "}
							<input
								type="number"
								value={maxPages}
								onChange={(e) => setMaxPages(Number(e.target.value))}
								disabled={disabled}
								min={1}
								max={500}
								style={{ width: "50px", fontSize: "12px" }}
							/>
						</label>
					</div>
					<button
						onClick={handleIndexUrl}
						disabled={disabled || !urlInput}
						style={{
							padding: "4px 12px",
							fontSize: "12px",
							cursor: disabled || !urlInput ? "not-allowed" : "pointer",
							background: "var(--vscode-button-background)",
							color: "var(--vscode-button-foreground)",
							border: "none",
							borderRadius: "3px",
							opacity: disabled || !urlInput ? 0.7 : 1,
							alignSelf: "flex-start",
						}}>
						{activeJobType === "url" ? "Crawling..." : "Index URL"}
					</button>
					{jobProgress && activeJobType === "url" && (
						<>
							{renderProgressBar(jobProgress)}
							{renderProgressInfo(jobProgress, true)}
						</>
					)}
				</div>
			</div>

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
