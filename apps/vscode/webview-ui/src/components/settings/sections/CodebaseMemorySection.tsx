import { EmptyRequest } from "@shared/proto/cline/common"
import { type CodebaseMemoryStatus, type IndexProgressEvent, IndexProjectRequest } from "@shared/proto/cline/codebase_memory"
import { useCallback, useEffect, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { CodebaseMemoryServiceClient } from "@/services/grpc-client"
import GraphCard from "./codebase-memory/GraphCard"
import IndexingCard from "./codebase-memory/IndexingCard"
import StatusCard from "./codebase-memory/StatusCard"
import ToolsCard from "./codebase-memory/ToolsCard"

export const CodebaseMemorySection = () => {
	const { workspaceRoots } = useExtensionState()
	const [status, setStatus] = useState<CodebaseMemoryStatus | undefined>()
	const [progressLines, setProgressLines] = useState<IndexProgressEvent[]>([])
	const [isIndexing, setIsIndexing] = useState(false)
	const [isDownloading, setIsDownloading] = useState(false)
	const [isOpeningGraph, setIsOpeningGraph] = useState(false)

	const refreshStatus = useCallback(() => {
		CodebaseMemoryServiceClient.getStatus(EmptyRequest.create({}))
			.then(setStatus)
			.catch((e) => console.error("Failed to get codebase-memory status:", e))
	}, [])

	useEffect(() => {
		refreshStatus()
	}, [refreshStatus])

	const handleDownload = useCallback(() => {
		setIsDownloading(true)
		CodebaseMemoryServiceClient.downloadBinary(EmptyRequest.create({}), {
			onResponse: (event: IndexProgressEvent) => {
				setProgressLines((prev) => [...prev, event])
			},
			onComplete: () => {
				setIsDownloading(false)
				refreshStatus()
			},
			onError: (err: Error) => {
				console.error("Download error:", err)
				setIsDownloading(false)
			},
		})
	}, [refreshStatus])

	const handleIndex = useCallback(() => {
		const repoPath = workspaceRoots?.[0]?.path ?? ""
		if (!repoPath) return
		setIsIndexing(true)
		setProgressLines([])
		CodebaseMemoryServiceClient.indexProject(IndexProjectRequest.create({ repoPath }), {
			onResponse: (event: IndexProgressEvent) => {
				setProgressLines((prev) => [...prev, event])
			},
			onComplete: () => {
				setIsIndexing(false)
				refreshStatus()
			},
			onError: (err: Error) => {
				console.error("Indexing error:", err)
				setIsIndexing(false)
			},
		})
	}, [workspaceRoots, refreshStatus])

	const handleReindex = useCallback(() => {
		setIsIndexing(true)
		setProgressLines([])
		CodebaseMemoryServiceClient.reindexProject(EmptyRequest.create({}), {
			onResponse: (event: IndexProgressEvent) => {
				setProgressLines((prev) => [...prev, event])
			},
			onComplete: () => {
				setIsIndexing(false)
				refreshStatus()
			},
			onError: (err: Error) => {
				console.error("Reindex error:", err)
				setIsIndexing(false)
			},
		})
	}, [refreshStatus])

	const handleViewGraph = useCallback(async () => {
		setIsOpeningGraph(true)
		try {
			await CodebaseMemoryServiceClient.viewGraph(EmptyRequest.create({}))
			refreshStatus()
		} catch (e) {
			console.error("Failed to open graph:", e)
		} finally {
			setIsOpeningGraph(false)
		}
	}, [refreshStatus])

	const handleStopGraph = useCallback(() => {
		CodebaseMemoryServiceClient.stopGraphServer(EmptyRequest.create({}))
			.then(() => refreshStatus())
			.catch((e) => console.error("Failed to stop graph server:", e))
	}, [refreshStatus])

	return (
		<div className="flex flex-col gap-6 px-4 py-3">
			<StatusCard status={status} onDownload={handleDownload} isDownloading={isDownloading} />
			<IndexingCard
				status={status}
				isIndexing={isIndexing}
				progressLines={progressLines}
				onIndex={handleIndex}
				onReindex={handleReindex}
				hasWorkspace={!!workspaceRoots?.length}
			/>
			<GraphCard status={status} isOpeningGraph={isOpeningGraph} onViewGraph={handleViewGraph} onStopGraph={handleStopGraph} />
			<ToolsCard />
		</div>
	)
}

export default CodebaseMemorySection
