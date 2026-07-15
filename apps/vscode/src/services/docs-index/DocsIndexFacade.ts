import type { McpHub } from "@services/mcp/McpHub"
import { Logger } from "@/shared/services/Logger"
import {
	CreateProjectResponse,
	DeleteDocumentResponse,
	DocumentInfo,
	DocsIndexProjectResponse,
	DocsIndexTools,
	IndexUrlResponse,
	ListDocumentsResponse,
	ListProjectsResponse,
	PingResponse,
	PollIndexJobResponse,
	ProjectInfo,
	ProjectStatsResponse,
	SearchDocumentsResponse,
	SearchResult,
	UploadFileResponse,
} from "@shared/proto/cline/docs_index"
import { toProtoTools } from "./constants"
import { McpRegistrationService } from "./McpRegistrationService"
import { VesselIndexerClient } from "./VesselIndexerClient"

export class DocsIndexFacade {
	private mcpRegistration: McpRegistrationService
	private clients: Map<string, VesselIndexerClient> = new Map()

	constructor(mcpHub: McpHub) {
		this.mcpRegistration = new McpRegistrationService(mcpHub)
	}

	private async getClient(serverUrl: string): Promise<VesselIndexerClient> {
		let client = this.clients.get(serverUrl)
		if (!client) {
			client = new VesselIndexerClient(serverUrl)
			await client.connect()
			this.clients.set(serverUrl, client)
		}
		return client
	}

	private async invalidateClient(serverUrl: string): Promise<void> {
		const client = this.clients.get(serverUrl)
		if (client) {
			await client.close()
			this.clients.delete(serverUrl)
		}
	}

	async ping(serverUrl: string): Promise<PingResponse> {
		try {
			const client = await this.getClient(serverUrl)
			await client.callTool("list_projects", {})
			return PingResponse.create({ connected: true, serverVersion: "" })
		} catch (err) {
			Logger.error("[DocsIndex] ping failed:", err)
			await this.invalidateClient(serverUrl)
			return PingResponse.create({ connected: false, serverVersion: "" })
		}
	}

	async listProjects(serverUrl: string): Promise<ListProjectsResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.callTool("list_projects", {})
			const projects = (result.projects || []).map((p: any) =>
				ProjectInfo.create({
					name: p.name || "",
					mountPath: p.mount_path || "",
					totalChunks: p.total_chunks || 0,
					status: p.status || "",
				}),
			)
			return ListProjectsResponse.create({ projects })
		} catch (err) {
			Logger.error("[DocsIndex] listProjects failed:", err)
			await this.invalidateClient(serverUrl)
			return ListProjectsResponse.create({ projects: [] })
		}
	}

	async listDocuments(serverUrl: string, project: string, page: number, pageSize: number): Promise<ListDocumentsResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.listDocuments(project, page, pageSize)
			const documents = (result.documents || []).map((d) =>
				DocumentInfo.create({
					path: d.path || "",
					fileType: d.file_type || "",
					chunks: d.chunks || 0,
					size: d.size || 0,
					modTime: d.mod_time || "",
				}),
			)
			return ListDocumentsResponse.create({
				project: result.project || project,
				page: result.page || page,
				pageSize: result.page_size || pageSize,
				total: result.total || 0,
				totalPages: result.total_pages || 0,
				documents,
			})
		} catch (err) {
			Logger.error("[DocsIndex] listDocuments failed:", err)
			await this.invalidateClient(serverUrl)
			return ListDocumentsResponse.create({ project, page, pageSize, total: 0, totalPages: 0, documents: [] })
		}
	}

	async deleteDocument(serverUrl: string, project: string, path: string): Promise<DeleteDocumentResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.deleteDocument(project, path)
			return DeleteDocumentResponse.create({
				project: result.project || project,
				path: result.path || path,
				chunksRemoved: result.chunks_removed || 0,
				fileDeleted: result.file_deleted || false,
				status: result.status || "deleted",
			})
		} catch (err) {
			Logger.error("[DocsIndex] deleteDocument failed:", err)
			await this.invalidateClient(serverUrl)
			return DeleteDocumentResponse.create({
				project,
				path,
				chunksRemoved: 0,
				fileDeleted: false,
				status: "error",
			})
		}
	}

	async pollIndexJob(serverUrl: string, project: string, jobId: string): Promise<PollIndexJobResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.pollIndexJob(project, jobId)
			// Response uses both "id" (raw Job struct) and "job_id" — prefer "id" if present
			const resolvedJobId = result.id || result.job_id || jobId
			return PollIndexJobResponse.create({
				jobId: resolvedJobId,
				project: result.project || project,
				type: result.type || "",
				status: result.status || "unknown",
				startedAt: result.started_at || "",
				finishedAt: result.finished_at || "",
				filesScanned: result.files_scanned || 0,
				filesIndexed: result.files_indexed || 0,
				filesFailed: result.files_failed || 0,
				chunksAdded: result.chunks_added || 0,
				error: result.error || "",
			})
		} catch (err) {
			Logger.error("[DocsIndex] pollIndexJob failed:", err)
			return PollIndexJobResponse.create({
				jobId,
				project,
				type: "",
				status: "error",
				startedAt: "",
				finishedAt: "",
				filesScanned: 0,
				filesIndexed: 0,
				filesFailed: 0,
				chunksAdded: 0,
				error: err instanceof Error ? err.message : String(err),
			})
		}
	}

	async projectStats(serverUrl: string, project: string): Promise<ProjectStatsResponse> {
		const client = await this.getClient(serverUrl)
		const result = await client.callTool("project_stats", { project })
		const byFormat: Record<string, number> = {}
		if (result.by_format) {
			for (const [key, val] of Object.entries(result.by_format)) {
				byFormat[key] = val as number
			}
		}
		return ProjectStatsResponse.create({
			project: result.project || project,
			totalChunks: result.total_chunks || 0,
			filesIndexed: result.files_indexed || 0,
			byFormat,
		})
	}

	async indexDocsProject(serverUrl: string, project: string): Promise<DocsIndexProjectResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.startIndexProject(project)
			return DocsIndexProjectResponse.create({
				jobId: result.job_id || "",
				project: result.project || project,
				status: result.status || "queued",
				startedAt: result.started_at || "",
			})
		} catch (err) {
			Logger.error("[DocsIndex] indexDocsProject failed:", err)
			await this.invalidateClient(serverUrl)
			return DocsIndexProjectResponse.create({
				jobId: "",
				project,
				status: "error",
				startedAt: "",
			})
		}
	}

	async createProject(serverUrl: string, name: string, mountPath: string): Promise<CreateProjectResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.createProject(name, mountPath)
			return CreateProjectResponse.create({
				name: result.name || name,
				mountPath: result.mount_path || mountPath,
				status: result.status || "created",
				message: result.message || "",
			})
		} catch (err) {
			Logger.error("[DocsIndex] createProject failed:", err)
			await this.invalidateClient(serverUrl)
			return CreateProjectResponse.create({
				name,
				mountPath,
				status: "error",
				message: err instanceof Error ? err.message : String(err),
			})
		}
	}

	async indexUrl(
		serverUrl: string,
		project: string,
		url: string,
		depth: number,
		maxPages: number,
	): Promise<IndexUrlResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.startIndexUrl(project, url, depth, maxPages)
			return IndexUrlResponse.create({
				jobId: result.job_id || "",
				project: result.project || project,
				status: result.status || "queued",
				startedAt: result.started_at || "",
			})
		} catch (err) {
			Logger.error("[DocsIndex] indexUrl failed:", err)
			await this.invalidateClient(serverUrl)
			return IndexUrlResponse.create({
				jobId: "",
				project,
				status: "error",
				startedAt: "",
			})
		}
	}

	async uploadFile(serverUrl: string, project: string, filePath: string): Promise<UploadFileResponse> {
		const client = await this.getClient(serverUrl)
		const result = await client.uploadFile(project, filePath)
		return UploadFileResponse.create({
			project: result.project,
			filename: result.filename,
			path: result.path,
			size: result.size,
			status: result.status,
		})
	}

	async searchDocuments(
		serverUrl: string,
		project: string,
		query: string,
		topK: number,
	): Promise<SearchDocumentsResponse> {
		const client = await this.getClient(serverUrl)
		const result = await client.callTool("search_documents", {
			project,
			query,
			top_k: topK,
		})
		const results = (result.results || []).map(
			(r: any) =>
				SearchResult.create({
					text: r.text || "",
					score: r.score || 0,
					hybridScore: r.hybrid_score || 0,
					metadata: JSON.stringify(r.metadata || {}),
				}),
		)
		return SearchDocumentsResponse.create({
			project: result.project || project,
			query: result.query || query,
			results,
		})
	}

	listDocsIndexTools(): DocsIndexTools {
		return DocsIndexTools.create({ tools: toProtoTools() })
	}

	async registerMcpServer(serverUrl: string): Promise<void> {
		await this.mcpRegistration.register(serverUrl)
	}

	async unregisterMcpServer(): Promise<void> {
		await this.mcpRegistration.unregister()
	}

	dispose(): void {
		for (const client of this.clients.values()) {
			client.close().catch((err) => Logger.error("[DocsIndex] dispose close error:", err))
		}
		this.clients.clear()
	}
}
