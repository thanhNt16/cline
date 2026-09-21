import * as fs from "node:fs/promises"
import * as path from "node:path"

export interface TaskInfo {
	id: string
	project: string
	status: string
	progress: number
	message: string
	detail?: string | null
}

export interface SearchHit {
	score: number
	doc_id: string
	source_name: string
	page: number
	chunk_index: number
	text: string
}

/**
 * Watcher state. The server echoes `path`/`debounce_secs` when a watch starts, but a
 * status read returns only the liveness fields — so both groups are optional.
 */
export interface CodebaseWatchInfo {
	active?: boolean
	status?: string
	path?: string
	debounce_secs?: number
	last_trigger?: string | null
	last_index?: string | null
	last_error?: string | null
}

export interface CodebaseToolEntry {
	name: string
	tool: string
	description: string
	is_readonly: boolean
}

export interface DocInfo {
	source: string
	bytes: number
	page_count: number
	chunk_count: number
	content_hash: string
	url: string
	/** Real crawled URL (absent for file uploads / legacy docs). */
	source_url?: string
	/** Crawl this page belongs to (absent for uploads). */
	crawl_id?: string
}

export interface CrawlInfo {
	crawl_id: string
	root_url: string
	status: string
	max_depth: number
	max_pages: number
	page_count: number
	created_at: string
}

export interface CrawlDetail {
	crawl: CrawlInfo
	pages: DocInfo[]
}

export class VesselIndexerClient {
	constructor(private readonly serverUrl: string) {}

	async listProjects(): Promise<{ projects: string[] }> {
		const response = await fetch(`${this.serverUrl}/projects`)
		if (!response.ok) throw new Error(`List projects failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async createProject(name: string): Promise<{ status: string; project: string }> {
		const params = new URLSearchParams({ project: name })
		const response = await fetch(`${this.serverUrl}/projects?${params}`, { method: "POST" })
		if (!response.ok) throw new Error(`Create project failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async renameProject(project: string, newName: string): Promise<{ status: string; project: string }> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: newName }),
		})
		if (!response.ok) throw new Error(`Rename project failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async deleteProject(project: string): Promise<{ status: string; project: string }> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}`, { method: "DELETE" })
		if (!response.ok) throw new Error(`Delete project failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async uploadFile(project: string, filePath: string): Promise<{ task_id: string }> {
		const fileBuffer = await fs.readFile(filePath)
		const filename = path.basename(filePath)
		const formData = new FormData()
		formData.append("file", new Blob([new Uint8Array(fileBuffer)]), filename)
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/documents`, {
			method: "POST",
			body: formData,
		})
		if (!response.ok) throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async indexUrl(project: string, url: string): Promise<{ crawl_id: string; task_id: string }> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/urls`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		})
		if (!response.ok) throw new Error(`Index URL failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async search(
		project: string,
		query: string,
		topK: number,
	): Promise<{ project: string; total_results: number; results: SearchHit[] }> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/search`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query, top_k: topK }),
		})
		if (!response.ok) throw new Error(`Search failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async getTask(taskId: string): Promise<TaskInfo> {
		const response = await fetch(`${this.serverUrl}/tasks/${encodeURIComponent(taskId)}`)
		if (!response.ok) throw new Error(`Get task failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async indexBatch(project: string): Promise<{ task_id: string }> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/index-batch`, {
			method: "POST",
		})
		if (!response.ok) throw new Error(`Index batch failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	/** `path` is resolved on the docindex server host, not on this machine. */
	async indexCodebase(project: string, path: string): Promise<{ task_id: string }> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/codebase`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ path }),
		})
		if (!response.ok) throw new Error(`Index codebase failed: ${response.status} ${await response.text()}`)
		return await response.json()
	}

	async startCodebaseWatch(project: string, path: string, debounceSecs?: number): Promise<CodebaseWatchInfo> {
		const body: { path: string; debounce_secs?: number } = { path }
		if (debounceSecs) body.debounce_secs = debounceSecs
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/codebase/watch`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		})
		if (!response.ok) throw new Error(`Start watch failed: ${response.status} ${await response.text()}`)
		return await response.json()
	}

	/** Returns null when the project has no watcher — the server signals that with a 404. */
	async getCodebaseWatch(project: string): Promise<CodebaseWatchInfo | null> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/codebase/watch`)
		if (response.status === 404) return null
		if (!response.ok) throw new Error(`Get watch failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async stopCodebaseWatch(project: string): Promise<{ status: string }> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/codebase/watch`, {
			method: "DELETE",
		})
		if (!response.ok) throw new Error(`Stop watch failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async listCodebaseTools(): Promise<{ tools: CodebaseToolEntry[] }> {
		const response = await fetch(`${this.serverUrl}/codebase/tools`)
		if (!response.ok) throw new Error(`List codebase tools failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async deleteDocument(project: string, source: string): Promise<{ status: string }> {
		const response = await fetch(
			`${this.serverUrl}/projects/${encodeURIComponent(project)}/documents/${encodeURIComponent(source)}`,
			{ method: "DELETE" },
		)
		if (!response.ok) throw new Error(`Delete document failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async listDocuments(project: string, offset = 0, limit = 50): Promise<{ documents: DocInfo[]; total: number }> {
		const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/documents?${params}`)
		if (!response.ok) throw new Error(`List documents failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	/** Same-domain BFS crawl. `maxDepth`/`maxPages` fall back to server defaults when omitted. */
	async crawlUrl(
		project: string,
		url: string,
		maxDepth?: number,
		maxPages?: number,
	): Promise<{ crawl_id: string; task_id: string }> {
		const body: { url: string; max_depth?: number; max_pages?: number } = { url }
		if (maxDepth != null) body.max_depth = maxDepth
		if (maxPages != null) body.max_pages = maxPages
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/crawls`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		})
		if (!response.ok) throw new Error(`Crawl URL failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async listCrawls(project: string): Promise<CrawlInfo[]> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/crawls`)
		if (!response.ok) throw new Error(`List crawls failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async getCrawl(project: string, crawlId: string): Promise<CrawlDetail> {
		const response = await fetch(
			`${this.serverUrl}/projects/${encodeURIComponent(project)}/crawls/${encodeURIComponent(crawlId)}`,
		)
		if (!response.ok) throw new Error(`Get crawl failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	/** Re-crawl an existing crawl row. Returns a task id to poll. */
	async refreshCrawl(project: string, crawlId: string): Promise<{ task_id: string }> {
		const response = await fetch(
			`${this.serverUrl}/projects/${encodeURIComponent(project)}/crawls/${encodeURIComponent(crawlId)}/refresh`,
			{ method: "POST" },
		)
		if (!response.ok) throw new Error(`Refresh crawl failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async deleteCrawl(project: string, crawlId: string): Promise<{ status: string }> {
		const response = await fetch(
			`${this.serverUrl}/projects/${encodeURIComponent(project)}/crawls/${encodeURIComponent(crawlId)}`,
			{ method: "DELETE" },
		)
		if (!response.ok) throw new Error(`Delete crawl failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}
}
