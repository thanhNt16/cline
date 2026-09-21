import {
	DeleteCrawlRequest,
	ListCrawlsRequest,
	type ListCrawlsResponse,
	RefreshCrawlRequest,
	TaskStatusRequest,
	type TaskStatusResponse,
} from "@shared/proto/cline/docs_index"
import { useCallback, useEffect, useRef, useState } from "react"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface CrawlsCardProps {
	serverUrl: string
	connected: boolean
	selectedProject: string
	refreshSignal: number
}

type CrawlRow = ListCrawlsResponse["crawls"][number]

export default function CrawlsCard({ serverUrl, connected, selectedProject, refreshSignal }: CrawlsCardProps) {
	const [crawls, setCrawls] = useState<CrawlRow[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")
	const [busyId, setBusyId] = useState<string | null>(null)
	const [taskMsg, setTaskMsg] = useState("")
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const stopPolling = useCallback(() => {
		if (pollRef.current) clearInterval(pollRef.current)
		pollRef.current = null
		setBusyId(null)
	}, [])

	useEffect(() => stopPolling, [stopPolling])

	const reload = useCallback(async () => {
		if (!connected || !selectedProject) {
			setCrawls([])
			return
		}
		setLoading(true)
		setError("")
		try {
			const res = await DocsIndexServiceClient.listCrawls(ListCrawlsRequest.create({ serverUrl, project: selectedProject }))
			setCrawls(res.crawls ?? [])
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setLoading(false)
		}
	}, [serverUrl, connected, selectedProject])

	useEffect(() => {
		reload()
	}, [reload, refreshSignal])

	const pollTask = (taskId: string, crawlId: string) => {
		stopPolling()
		setBusyId(crawlId)
		setTaskMsg("refreshing…")
		const poll = async () => {
			try {
				const t: TaskStatusResponse = await DocsIndexServiceClient.getTask(
					TaskStatusRequest.create({ serverUrl, taskId }),
				)
				setTaskMsg(`${t.status}${t.message ? ` — ${t.message}` : ""}`)
				if (t.status === "done" || t.status === "failed") {
					stopPolling()
					setTaskMsg("")
					reload()
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err))
				stopPolling()
				setTaskMsg("")
			}
		}
		poll()
		pollRef.current = setInterval(poll, 2000)
	}

	const handleRefresh = async (crawlId: string) => {
		setError("")
		try {
			const res = await DocsIndexServiceClient.refreshCrawl(
				RefreshCrawlRequest.create({ serverUrl, project: selectedProject, crawlId }),
			)
			if (res.taskId) pollTask(res.taskId, crawlId)
			else setError("Server did not return a task id")
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		}
	}

	const handleDelete = async (crawlId: string) => {
		if (!confirm("Delete this crawl and its indexed pages?")) return
		setError("")
		try {
			await DocsIndexServiceClient.deleteCrawl(DeleteCrawlRequest.create({ serverUrl, project: selectedProject, crawlId }))
			await reload()
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		}
	}

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: connected ? 1 : 0.5,
			}}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
				<div style={{ fontSize: "13px", fontWeight: 600 }}>Crawls</div>
				<button
					disabled={loading}
					onClick={reload}
					style={{
						background: "none",
						border: "none",
						color: "var(--vscode-textLink)",
						cursor: "pointer",
						fontSize: "12px",
						padding: 0,
					}}
					type="button">
					{loading ? "Refreshing…" : "Refresh"}
				</button>
			</div>
			<div style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
				Same-domain crawls in <code>{selectedProject || "(select a project)"}</code>
			</div>
			{!loading && error && <div style={{ fontSize: "12px", color: "var(--vscode-errorForeground)" }}>{error}</div>}
			{!loading && !error && crawls.length === 0 && (
				<div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>No crawls yet.</div>
			)}
			{crawls.length > 0 && (
				<ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
					{crawls.map((c) => (
						<li
							key={c.crawlId}
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "2px",
								fontSize: "12px",
								borderTop: "1px solid var(--vscode-panel-border)",
								paddingTop: "6px",
							}}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
								<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
									{c.rootUrl}
								</span>
								<span style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
									<button
										disabled={busyId === c.crawlId}
										onClick={() => handleRefresh(c.crawlId)}
										style={{
											background: "none",
											border: "none",
											color: "var(--vscode-textLink)",
											cursor: "pointer",
											fontSize: "12px",
											padding: 0,
										}}
										type="button">
										{busyId === c.crawlId ? taskMsg || "…" : "Refresh"}
									</button>
									<button
										disabled={busyId === c.crawlId}
										onClick={() => handleDelete(c.crawlId)}
										style={{
											background: "none",
											border: "none",
											color: "var(--vscode-errorForeground)",
											cursor: "pointer",
											fontSize: "12px",
											padding: 0,
										}}
										type="button">
										Delete
									</button>
								</span>
							</div>
							<div style={{ color: "var(--vscode-descriptionForeground)" }}>
								{c.status} · {c.pageCount} pages · depth {c.maxDepth}/{c.maxPages}
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
