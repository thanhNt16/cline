import { useState } from "react"
import {
	SearchDocumentsRequest,
	type SearchDocumentsResponse,
	type SearchResult,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface SearchCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
}

export default function SearchCard({ serverUrl, connected, selectedProject }: SearchCardProps) {
	const [query, setQuery] = useState("")
	const [topK, setTopK] = useState(10)
	const [searching, setSearching] = useState(false)
	const [results, setResults] = useState<SearchResult[]>([])
	const [hasSearched, setHasSearched] = useState(false)

	const disabled = !connected || !selectedProject

	const handleSearch = async () => {
		if (!query.trim()) return
		setSearching(true)
		setHasSearched(true)
		try {
			const response = await DocsIndexServiceClient.searchDocuments(
				SearchDocumentsRequest.create({
					serverUrl,
					project: selectedProject,
					query,
					topK,
				}),
			)
			setResults(response.results ?? [])
		} catch (err) {
			console.error("Search failed:", err)
			setResults([])
		} finally {
			setSearching(false)
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
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Search Documents</div>
			<div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && !disabled && !searching && handleSearch()}
					disabled={disabled}
					placeholder="Search query..."
					style={{
						flex: 1,
						padding: "4px 8px",
						fontSize: "12px",
						background: "var(--vscode-input-background)",
						color: "var(--vscode-input-foreground)",
						border: "1px solid var(--vscode-input-border)",
						borderRadius: "3px",
					}}
				/>
				<button
					onClick={handleSearch}
					disabled={disabled || searching || !query.trim()}
					style={{
						padding: "4px 12px",
						fontSize: "12px",
						cursor: disabled || searching || !query.trim() ? "not-allowed" : "pointer",
						background: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
						border: "none",
						borderRadius: "3px",
						opacity: disabled || searching || !query.trim() ? 0.7 : 1,
					}}>
					{searching ? "Searching..." : "Search"}
				</button>
			</div>
			<div style={{ marginBottom: "8px" }}>
				<label style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
					Results:{" "}
					<input
						type="number"
						value={topK}
						onChange={(e) => setTopK(Number(e.target.value))}
						disabled={disabled}
						min={1}
						max={50}
						style={{ width: "50px", fontSize: "12px" }}
					/>
				</label>
			</div>
			{hasSearched && (
				<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
					{results.length === 0 ? (
						<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
							No results found.
						</div>
					) : (
						results.map((result, i) => {
							let metadata: Record<string, any> = {}
							try {
								metadata = JSON.parse(result.metadata)
							} catch {}
							return (
								<div
									key={i}
									style={{
										padding: "8px",
										border: "1px solid var(--vscode-panel-border)",
										borderRadius: "3px",
										fontSize: "12px",
									}}>
									<div style={{ marginBottom: "4px" }}>
										{result.text.length > 200 ? result.text.slice(0, 200) + "..." : result.text}
									</div>
									<div
										style={{
											display: "flex",
											gap: "8px",
											fontSize: "11px",
											color: "var(--vscode-descriptionForeground)",
										}}>
										<span>Score: {(result.score * 100).toFixed(1)}%</span>
										<span>Hybrid: {(result.hybridScore * 100).toFixed(1)}%</span>
										{metadata.file_type && <span>Type: {metadata.file_type}</span>}
										{metadata.page && <span>Page: {metadata.page}</span>}
									</div>
								</div>
							)
						})
					)}
				</div>
			)}
		</div>
	)
}
