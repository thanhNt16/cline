import type { McpHub } from "@services/mcp/McpHub"
import { Logger } from "@/shared/services/Logger"
import {
	DocsIndexTools,
	DocsIndexProjectResponse,
	IndexUrlResponse,
	ListProjectsResponse,
	PingResponse,
	ProjectInfo,
	ProjectStatsResponse,
	SearchDocumentsResponse,
	SearchResult,
	UploadFileResponse,
} from "@shared/proto/cline/docs_index"
import * as vscode from "vscode"
import { toProtoTools, DOCS_INDEX_TOOLS } from "./constants"
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
		const client = await this.getClient(serverUrl)
		const result = await client.callTool("index_project", { project })
		return DocsIndexProjectResponse.create({
			filesScanned: result.files_scanned || 0,
			filesIndexed: result.files_indexed || 0,
			filesFailed: result.files_failed || 0,
			chunksAdded: result.chunks_added || 0,
			elapsedMs: result.elapsed_ms || 0,
		})
	}

	async indexUrl(
		serverUrl: string,
		project: string,
		url: string,
		depth: number,
		maxPages: number,
	): Promise<IndexUrlResponse> {
		const client = await this.getClient(serverUrl)
		const result = await client.callTool("index_url", {
			project,
			url,
			depth,
			max_pages: maxPages,
		})
		return IndexUrlResponse.create({
			project: result.project || project,
			seedUrl: result.seed_url || url,
			pagesCrawled: result.pages_crawled || 0,
			chunksAdded: result.chunks_added || 0,
		})
	}

	async uploadFile(serverUrl: string, project: string): Promise<UploadFileResponse> {
		const uris = await vscode.window.showOpenDialog({
			canSelectMany: false,
			title: "Select a document to upload",
			filters: {
				Documents: ["pdf", "docx", "pptx", "xlsx", "xls", "md", "txt", "csv", "html", "htm"],
			},
		})
		if (!uris || uris.length === 0) {
			return UploadFileResponse.create({ project, filename: "", path: "", size: 0, status: "cancelled" })
		}
		const filePath = uris[0].fsPath
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
