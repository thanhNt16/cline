import type { McpHub } from "@services/mcp/McpHub"
import {
	CodebaseToolCatalog,
	CodebaseToolInfo,
	CodebaseWatchStatus,
	CrawlInfo as CrawlInfoProto,
	CrawlUrlResponse,
	CreateProjectResponse,
	DeleteCrawlResponse,
	DeleteDocumentResponse,
	DocsIndexTools,
	DocumentInfo,
	GetCrawlResponse,
	IndexBatchResponse,
	IndexCodebaseResponse,
	IndexUrlResponse,
	ListCrawlsResponse,
	ListDocumentsResponse,
	ListProjectsResponse,
	PingResponse,
	ProjectInfo,
	ProjectMutationResponse,
	RefreshCrawlResponse,
	SearchDocumentsResponse,
	SearchResult,
	TaskStatusResponse,
	UploadFileResponse,
} from "@shared/proto/cline/docs_index"
import { getWorkspacePath } from "@utils/path"
import { Logger } from "@/shared/services/Logger"
import { toProtoTools } from "./constants"
import { type DocsIndexSettings, DocsIndexSettingsService } from "./DocsIndexSettingsService"
import { McpRegistrationService } from "./McpRegistrationService"
import { DocInfo, VesselIndexerClient } from "./VesselIndexerClient"

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export class DocsIndexFacade {
	private mcpRegistration: McpRegistrationService

	constructor(mcpHub: McpHub) {
		this.mcpRegistration = new McpRegistrationService(mcpHub)
	}

	async ping(serverUrl: string): Promise<PingResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			await client.listProjects()
			return PingResponse.create({ connected: true, serverVersion: "" })
		} catch (err) {
			Logger.error("[DocsIndex] ping failed:", err)
			return PingResponse.create({ connected: false, serverVersion: "" })
		}
	}

	async listProjects(serverUrl: string): Promise<ListProjectsResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.listProjects()
			const projects = (result.projects || []).map((name: string) => ProjectInfo.create({ name }))
			return ListProjectsResponse.create({ projects })
		} catch (err) {
			Logger.error("[DocsIndex] listProjects failed:", err)
			return ListProjectsResponse.create({ projects: [] })
		}
	}

	async createProject(serverUrl: string, name: string): Promise<CreateProjectResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.createProject(name)
			return CreateProjectResponse.create({ project: result.project || name, status: result.status || "ok" })
		} catch (err) {
			Logger.error("[DocsIndex] createProject failed:", err)
			return CreateProjectResponse.create({ project: name, status: "error" })
		}
	}

	async renameProject(serverUrl: string, project: string, newName: string): Promise<ProjectMutationResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.renameProject(project, newName)
			return ProjectMutationResponse.create({ project: result.project || newName, status: result.status || "ok" })
		} catch (err) {
			Logger.error("[DocsIndex] renameProject failed:", err)
			// Surface the reason: rename fails on 409 (name taken / active tasks), which
			// the user has to see to act on.
			return ProjectMutationResponse.create({ project, status: "error", error: errorText(err) })
		}
	}

	async deleteProject(serverUrl: string, project: string): Promise<ProjectMutationResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.deleteProject(project)
			return ProjectMutationResponse.create({ project: result.project || project, status: result.status || "ok" })
		} catch (err) {
			Logger.error("[DocsIndex] deleteProject failed:", err)
			return ProjectMutationResponse.create({ project, status: "error", error: errorText(err) })
		}
	}

	async uploadFile(serverUrl: string, project: string, filePath: string): Promise<UploadFileResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.uploadFile(project, filePath)
			return UploadFileResponse.create({ taskId: result.task_id || "", project, status: "accepted" })
		} catch (err) {
			Logger.error("[DocsIndex] uploadFile failed:", err)
			return UploadFileResponse.create({ taskId: "", project, status: "error" })
		}
	}

	async indexUrl(serverUrl: string, project: string, url: string): Promise<IndexUrlResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.indexUrl(project, url)
			return IndexUrlResponse.create({ taskId: result.task_id || "", project, status: "accepted" })
		} catch (err) {
			Logger.error("[DocsIndex] indexUrl failed:", err)
			return IndexUrlResponse.create({ taskId: "", project, status: "error" })
		}
	}

	async crawlUrl(
		serverUrl: string,
		project: string,
		url: string,
		maxDepth: number,
		maxPages: number,
	): Promise<CrawlUrlResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const depth = maxDepth > 0 ? maxDepth : undefined
			const pages = maxPages > 0 ? maxPages : undefined
			const result = await client.crawlUrl(project, url, depth, pages)
			return CrawlUrlResponse.create({
				crawlId: result.crawl_id || "",
				taskId: result.task_id || "",
				project,
				status: "accepted",
			})
		} catch (err) {
			Logger.error("[DocsIndex] crawlUrl failed:", err)
			return CrawlUrlResponse.create({ crawlId: "", taskId: "", project, status: "error" })
		}
	}

	async listCrawls(serverUrl: string, project: string): Promise<ListCrawlsResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const crawls = (await client.listCrawls(project)).map((c) =>
				CrawlInfoProto.create({
					crawlId: c.crawl_id || "",
					rootUrl: c.root_url || "",
					status: c.status || "",
					maxDepth: c.max_depth || 0,
					maxPages: c.max_pages || 0,
					pageCount: c.page_count || 0,
					createdAt: c.created_at || "",
				}),
			)
			return ListCrawlsResponse.create({ crawls })
		} catch (err) {
			Logger.error("[DocsIndex] listCrawls failed:", err)
			return ListCrawlsResponse.create({ crawls: [] })
		}
	}

	async getCrawl(serverUrl: string, project: string, crawlId: string): Promise<GetCrawlResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const detail = await client.getCrawl(project, crawlId)
			const crawl = CrawlInfoProto.create({
				crawlId: detail.crawl.crawl_id || "",
				rootUrl: detail.crawl.root_url || "",
				status: detail.crawl.status || "",
				maxDepth: detail.crawl.max_depth || 0,
				maxPages: detail.crawl.max_pages || 0,
				pageCount: detail.crawl.page_count || 0,
				createdAt: detail.crawl.created_at || "",
			})
			return GetCrawlResponse.create({ crawl })
		} catch (err) {
			Logger.error("[DocsIndex] getCrawl failed:", err)
			return GetCrawlResponse.create({})
		}
	}

	async refreshCrawl(serverUrl: string, project: string, crawlId: string): Promise<RefreshCrawlResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.refreshCrawl(project, crawlId)
			return RefreshCrawlResponse.create({ taskId: result.task_id || "" })
		} catch (err) {
			Logger.error("[DocsIndex] refreshCrawl failed:", err)
			return RefreshCrawlResponse.create({ taskId: "" })
		}
	}

	async deleteCrawl(serverUrl: string, project: string, crawlId: string): Promise<DeleteCrawlResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.deleteCrawl(project, crawlId)
			return DeleteCrawlResponse.create({ status: result.status || "ok" })
		} catch (err) {
			Logger.error("[DocsIndex] deleteCrawl failed:", err)
			return DeleteCrawlResponse.create({ status: "error" })
		}
	}

	async getTask(serverUrl: string, taskId: string): Promise<TaskStatusResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
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

	async indexBatch(serverUrl: string, project: string): Promise<IndexBatchResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.indexBatch(project)
			return IndexBatchResponse.create({ taskId: result.task_id || "" })
		} catch (err) {
			Logger.error("[DocsIndex] indexBatch failed:", err)
			return IndexBatchResponse.create({ taskId: "" })
		}
	}

	async indexCodebase(serverUrl: string, project: string, path: string): Promise<IndexCodebaseResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.indexCodebase(project, path)
			return IndexCodebaseResponse.create({ taskId: result.task_id || "", status: "accepted" })
		} catch (err) {
			Logger.error("[DocsIndex] indexCodebase failed:", err)
			// 400 (bad path) / 404 (no project) / 409 (already indexing) all carry a reason
			// the user has to see to act on.
			return IndexCodebaseResponse.create({ taskId: "", status: "error", error: errorText(err) })
		}
	}

	async startCodebaseWatch(
		serverUrl: string,
		project: string,
		path: string,
		debounceSecs: number,
	): Promise<CodebaseWatchStatus> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const w = await client.startCodebaseWatch(project, path, debounceSecs || undefined)
			return CodebaseWatchStatus.create({
				active: true,
				path: w.path || path,
				debounceSecs: w.debounce_secs ?? debounceSecs,
			})
		} catch (err) {
			Logger.error("[DocsIndex] startCodebaseWatch failed:", err)
			return CodebaseWatchStatus.create({ active: false, error: errorText(err) })
		}
	}

	async getCodebaseWatch(serverUrl: string, project: string): Promise<CodebaseWatchStatus> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const w = await client.getCodebaseWatch(project)
			// null = no watcher for this project, which is the normal state, not an error.
			if (!w) return CodebaseWatchStatus.create({ active: false })
			return CodebaseWatchStatus.create({
				active: w.active ?? true,
				path: w.path || "",
				debounceSecs: w.debounce_secs ?? 0,
				lastTrigger: w.last_trigger || "",
				lastIndex: w.last_index || "",
				error: w.last_error || "",
			})
		} catch (err) {
			Logger.error("[DocsIndex] getCodebaseWatch failed:", err)
			return CodebaseWatchStatus.create({ active: false, error: errorText(err) })
		}
	}

	async stopCodebaseWatch(serverUrl: string, project: string): Promise<CodebaseWatchStatus> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			await client.stopCodebaseWatch(project)
			return CodebaseWatchStatus.create({ active: false })
		} catch (err) {
			Logger.error("[DocsIndex] stopCodebaseWatch failed:", err)
			return CodebaseWatchStatus.create({ active: true, error: errorText(err) })
		}
	}

	async listCodebaseTools(serverUrl: string): Promise<CodebaseToolCatalog> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.listCodebaseTools()
			const tools = (result.tools || []).map((t) =>
				CodebaseToolInfo.create({
					name: t.name || "",
					tool: t.tool || "",
					description: t.description || "",
					isReadonly: t.is_readonly ?? true,
				}),
			)
			return CodebaseToolCatalog.create({ tools })
		} catch (err) {
			Logger.error("[DocsIndex] listCodebaseTools failed:", err)
			return CodebaseToolCatalog.create({ tools: [] })
		}
	}

	async deleteDocument(serverUrl: string, project: string, source: string): Promise<DeleteDocumentResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.deleteDocument(project, source)
			return DeleteDocumentResponse.create({ status: result.status || "ok" })
		} catch (err) {
			Logger.error("[DocsIndex] deleteDocument failed:", err)
			return DeleteDocumentResponse.create({ status: "error" })
		}
	}

	async listDocuments(serverUrl: string, project: string, offset = 0, limit = 50): Promise<ListDocumentsResponse> {
		const safeOffset = Math.max(0, offset)
		const safeLimit = limit > 0 ? limit : 50
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.listDocuments(project, safeOffset, safeLimit)
			const documents = (result.documents || []).map((d: DocInfo) =>
				DocumentInfo.create({
					source: d.source || "",
					bytes: d.bytes || 0,
					pageCount: d.page_count || 0,
					chunkCount: d.chunk_count || 0,
					contentHash: d.content_hash || "",
					url: d.url || "",
					sourceUrl: d.source_url || "",
					crawlId: d.crawl_id || "",
				}),
			)
			return ListDocumentsResponse.create({ documents, total: result.total || 0, offset: safeOffset, limit: safeLimit })
		} catch (err) {
			Logger.error("[DocsIndex] listDocuments failed:", err)
			return ListDocumentsResponse.create({ documents: [], total: 0, offset: safeOffset, limit: safeLimit })
		}
	}

	async searchDocuments(serverUrl: string, project: string, query: string, topK: number): Promise<SearchDocumentsResponse> {
		try {
			const client = new VesselIndexerClient(serverUrl)
			const result = await client.search(project, query, topK)
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
			return SearchDocumentsResponse.create({ project, query, results: [] })
		}
	}

	listDocsIndexTools(): DocsIndexTools {
		return DocsIndexTools.create({ tools: toProtoTools() })
	}

	async registerMcpServer(serverUrl: string, selectedProject?: string): Promise<void> {
		await this.mcpRegistration.register(serverUrl, selectedProject)
	}

	async unregisterMcpServer(): Promise<void> {
		await this.mcpRegistration.unregister()
	}

	async getWorkspacePath(): Promise<string> {
		return getWorkspacePath()
	}

	async getDocsIndexSettings(
		workspacePath: string,
	): Promise<{ serverUrl: string; lastSelectedProject: string; crawlMaxDepth: number; crawlMaxPages: number }> {
		const settings = await new DocsIndexSettingsService().get()
		let mcpProject: string | undefined
		try {
			mcpProject = await this.mcpRegistration.getSelectedProject()
		} catch {}
		const lastSelectedProject = mcpProject ?? settings.lastProjects[workspacePath] ?? ""
		return {
			serverUrl: settings.serverUrl,
			lastSelectedProject,
			crawlMaxDepth: settings.crawlMaxDepth,
			crawlMaxPages: settings.crawlMaxPages,
		}
	}

	async updateDocsIndexSettings(
		workspacePath: string,
		serverUrl: string | undefined,
		selectedProject: string | undefined,
		crawlMaxDepth?: number,
		crawlMaxPages?: number,
	): Promise<{ serverUrl: string; lastSelectedProject: string }> {
		const svc = new DocsIndexSettingsService()
		const patch: Partial<DocsIndexSettings> = {}
		if (serverUrl !== undefined) patch.serverUrl = serverUrl
		if (selectedProject !== undefined && workspacePath) {
			const current = await svc.get()
			patch.lastProjects = { ...current.lastProjects, [workspacePath]: selectedProject }
		}
		if (crawlMaxDepth !== undefined) patch.crawlMaxDepth = crawlMaxDepth
		if (crawlMaxPages !== undefined) patch.crawlMaxPages = crawlMaxPages
		const next = await svc.update(patch)
		if (selectedProject && workspacePath) {
			try {
				await this.mcpRegistration.setSelectedProject(selectedProject)
			} catch (err) {
				Logger.warn("[DocsIndex] failed to persist selectedProject to MCP settings:", err)
			}
		}
		return { serverUrl: next.serverUrl, lastSelectedProject: next.lastProjects[workspacePath] ?? "" }
	}

	dispose(): void {}
}
