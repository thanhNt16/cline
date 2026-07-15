import { useRef, useState } from "react"
import {
	DocsIndexProjectRequest,
	IndexUrlRequest,
	PollIndexJobRequest,
	type DocsIndexProjectResponse,
	type IndexUrlResponse,
	type PollIndexJobResponse,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface IndexCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function IndexCard({ serverUrl, connected, selectedProject }: IndexCardProps) {
	const [indexResult, setIndexResult] = useState<DocsIndexProjectResponse | undefined>()
	const [urlInput, setUrlInput] = useState("")
	const [depth, setDepth] = useState(3)
	const [maxPages, setMaxPages] = useState(50)
	const [urlResult, setUrlResult] = useState<IndexUrlResponse | undefined>()
	const [error, setError] = useState<string | null>(null)
	const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const [activeJobId, setActiveJobId] = useState<string | null>(null)
	const [activeJobType, setActiveJobType] = useState<"project" | "url" | null>(null)
	const [jobProgress, setJobProgress] = useState<PollIndexJobResponse | null>(null)

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
	}

	const handleIndexProject = async () => {
		setError(null)
		setIndexResult(undefined)
		setJobProgress(null)
		try {
			const response = await DocsIndexServiceClient.indexDocsProject(
				DocsIndexProjectRequest.create({ serverUrl, project: selectedProject }),
			)
			setIndexResult(response)
			if (response.jobId) {
				startPolling(response.jobId, "project")
			}
		} catch (err) {
			setError(`Index failed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	const handleIndexUrl = async () => {
		setError(null)
		setUrlResult(undefined)
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
			setUrlResult(response)
			if (response.jobId) {
				startPolling(response.jobId, "url")
			}
		} catch (err) {
			setError(`URL index failed: ${err instanceof Error ? err.message : String(err)}`)
		}
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
				{indexResult && (
					<div
						style={{
							marginTop: "6px",
							fontSize: "12px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						Scanned {indexResult.filesScanned}, indexed {indexResult.filesIndexed} new,{" "}
						{indexResult.chunksAdded} chunks added ({(indexResult.elapsedMs / 1000).toFixed(1)}s)
					</div>
				)}
				{jobProgress && activeJobType === "project" && (
					<div
						style={{
							marginTop: "8px",
							fontSize: "12px",
							color:
								jobProgress.status === "failed"
									? "var(--vscode-errorForeground)"
									: jobProgress.status === "completed"
										? "var(--vscode-testing-iconPassed)"
										: "var(--vscode-descriptionForeground)",
						}}>
						{jobProgress.status === "completed"
							? `Indexed ${jobProgress.filesIndexed} files (${jobProgress.chunksAdded} chunks, ${jobProgress.filesFailed} failed)`
							: jobProgress.status === "failed"
								? `Indexing failed: ${jobProgress.error || "unknown error"}`
								: `Status: ${jobProgress.status} — ${jobProgress.filesIndexed} files indexed, ${jobProgress.chunksAdded} chunks added...`}
					</div>
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
					{urlResult && (
						<div
							style={{
								fontSize: "12px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							Crawled {urlResult.pagesCrawled} pages, {urlResult.chunksAdded} chunks added
						</div>
					)}
					{jobProgress && activeJobType === "url" && (
						<div
							style={{
								marginTop: "8px",
								fontSize: "12px",
								color:
									jobProgress.status === "failed"
										? "var(--vscode-errorForeground)"
										: jobProgress.status === "completed"
											? "var(--vscode-testing-iconPassed)"
											: "var(--vscode-descriptionForeground)",
							}}>
							{jobProgress.status === "completed"
								? `Crawled ${jobProgress.filesIndexed} pages (${jobProgress.chunksAdded} chunks added)`
								: jobProgress.status === "failed"
									? `URL indexing failed: ${jobProgress.error || "unknown error"}`
									: `Status: ${jobProgress.status} — ${jobProgress.filesIndexed} pages crawled...`}
						</div>
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
