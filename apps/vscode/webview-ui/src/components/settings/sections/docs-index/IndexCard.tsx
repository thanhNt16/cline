import { useState } from "react"
import {
	DocsIndexProjectRequest,
	IndexUrlRequest,
	type DocsIndexProjectResponse,
	type IndexUrlResponse,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface IndexCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function IndexCard({ serverUrl, connected, selectedProject }: IndexCardProps) {
	const [indexing, setIndexing] = useState(false)
	const [indexResult, setIndexResult] = useState<DocsIndexProjectResponse | undefined>()
	const [urlInput, setUrlInput] = useState("")
	const [depth, setDepth] = useState(3)
	const [maxPages, setMaxPages] = useState(50)
	const [urlIndexing, setUrlIndexing] = useState(false)
	const [urlResult, setUrlResult] = useState<IndexUrlResponse | undefined>()
	const [error, setError] = useState<string | null>(null)

	const disabled = !connected || !selectedProject

	const handleIndexProject = async () => {
		setIndexing(true)
		setError(null)
		setIndexResult(undefined)
		try {
			const response = await DocsIndexServiceClient.indexDocsProject(
				DocsIndexProjectRequest.create({ serverUrl, project: selectedProject }),
			)
			setIndexResult(response)
		} catch (err) {
			setError(`Index failed: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setIndexing(false)
		}
	}

	const handleIndexUrl = async () => {
		setUrlIndexing(true)
		setError(null)
		setUrlResult(undefined)
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
		} catch (err) {
			setError(`URL index failed: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setUrlIndexing(false)
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
					disabled={disabled || indexing}
					style={{
						padding: "4px 12px",
						fontSize: "12px",
						cursor: disabled || indexing ? "not-allowed" : "pointer",
						background: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
						border: "none",
						borderRadius: "3px",
						opacity: disabled || indexing ? 0.7 : 1,
					}}>
					{indexing ? "Indexing..." : "Index Project"}
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
						disabled={disabled || urlIndexing || !urlInput}
						style={{
							padding: "4px 12px",
							fontSize: "12px",
							cursor: disabled || urlIndexing || !urlInput ? "not-allowed" : "pointer",
							background: "var(--vscode-button-background)",
							color: "var(--vscode-button-foreground)",
							border: "none",
							borderRadius: "3px",
							opacity: disabled || urlIndexing || !urlInput ? 0.7 : 1,
							alignSelf: "flex-start",
						}}>
						{urlIndexing ? "Crawling..." : "Index URL"}
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
