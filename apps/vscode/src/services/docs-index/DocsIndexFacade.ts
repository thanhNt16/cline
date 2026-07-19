import type { McpHub } from "@services/mcp/McpHub"
import { Logger } from "@/shared/services/Logger"
import {
	CreateProjectResponse,
	DeleteDocumentResponse,
	DocsIndexTools,
	IndexUrlResponse,
	ListProjectsResponse,
	PingResponse,
	ProjectInfo,
	SearchDocumentsResponse,
	SearchResult,
	TaskStatusResponse,
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
			const projects = (result.projects || []).map((name: string) => ProjectInfo.create({ name }))
			return ListProjectsResponse.create({ projects })
		} catch (err) {
			Logger.error("[DocsIndex] listProjects failed:", err)
			await this.invalidateClient(serverUrl)
			return ListProjectsResponse.create({ projects: [] })
		}
	}

	async createProject(serverUrl: string, name: string): Promise<CreateProjectResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.createProject(name)
			return CreateProjectResponse.create({ project: result.project || name, status: result.status || "ok" })
		} catch (err) {
			Logger.error("[DocsIndex] createProject failed:", err)
			await this.invalidateClient(serverUrl)
			return CreateProjectResponse.create({ project: name, status: "error" })
		}
	}

	async uploadFile(serverUrl: string, project: string, filePath: string): Promise<UploadFileResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.uploadFile(project, filePath)
			return UploadFileResponse.create({ taskId: result.task_id || "", project, status: "accepted" })
		} catch (err) {
			Logger.error("[DocsIndex] uploadFile failed:", err)
			await this.invalidateClient(serverUrl)
			return UploadFileResponse.create({ taskId: "", project, status: "error" })
		}
	}

	async indexUrl(serverUrl: string, project: string, url: string): Promise<IndexUrlResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.indexUrl(project, url)
			return IndexUrlResponse.create({ taskId: result.task_id || "", project, status: "accepted" })
		} catch (err) {
			Logger.error("[DocsIndex] indexUrl failed:", err)
			await this.invalidateClient(serverUrl)
			return IndexUrlResponse.create({ taskId: "", project, status: "error" })
		}
	}

	async getTask(serverUrl: string, taskId: string): Promise<TaskStatusResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const t = await client.getTask(taskId)
			return TaskStatusResponse.create({
				id: t.id || taskId,
				project: t.project || "",
				status: t.status || "unknown",
				progress: t.progress || 0,
				message: t.message || "",
				detail: t.detail || "",
			})
		} catch (err) {
			Logger.error("[DocsIndex] getTask failed:", err)
			return TaskStatusResponse.create({
				id: taskId,
				project: "",
				status: "failed",
				progress: 0,
				message: "",
				detail: err instanceof Error ? err.message : String(err),
			})
		}
	}

	async deleteDocument(serverUrl: string, project: string, source: string): Promise<DeleteDocumentResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.deleteDocument(project, source)
			return DeleteDocumentResponse.create({ status: result.status || "ok" })
		} catch (err) {
			Logger.error("[DocsIndex] deleteDocument failed:", err)
			await this.invalidateClient(serverUrl)
			return DeleteDocumentResponse.create({ status: "error" })
		}
	}

	async searchDocuments(serverUrl: string, project: string, query: string, topK: number): Promise<SearchDocumentsResponse> {
		try {
			const client = await this.getClient(serverUrl)
			const result = await client.callTool("search", { project, query, top_k: topK })
			const results = (result.results || []).map((r: any) =>
				SearchResult.create({
					score: r.score || 0,
					docId: r.doc_id || "",
					sourceName: r.source_name || "",
					page: r.page || 0,
					chunkIndex: r.chunk_index || 0,
					text: r.text || "",
				}),
			)
			return SearchDocumentsResponse.create({ project, query, results })
		} catch (err) {
			Logger.error("[DocsIndex] searchDocuments failed:", err)
			await this.invalidateClient(serverUrl)
			return SearchDocumentsResponse.create({ project, query, results: [] })
		}
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
