import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { Logger } from "@/shared/services/Logger"

export interface UploadResult {
	project: string
	filename: string
	path: string
	size: number
	status: string
}

export class VesselIndexerClient {
	private client: Client | null = null

	constructor(private readonly serverUrl: string) {}

	async connect(): Promise<void> {
		if (this.client) return
		const url = new URL(`${this.serverUrl}/mcp`)
		const transport = new StreamableHTTPClientTransport(url)
		this.client = new Client({ name: "cline-docs-index", version: "1.0.0" }, { capabilities: {} })
		await this.client.connect(transport)
	}

	async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
		if (!this.client) {
			await this.connect()
		}
		const result = await this.client!.request(
			{
				method: "tools/call",
				params: { name: toolName, arguments: args },
			},
			CallToolResultSchema,
		)
		const textContent = result.content?.find((c: any) => c.type === "text") as { text: string } | undefined
		if (!textContent?.text) {
			throw new Error(`Tool ${toolName} returned no text content`)
		}
		try {
			return JSON.parse(textContent.text)
		} catch {
			return textContent.text
		}
	}

	async uploadFile(project: string, filePath: string): Promise<UploadResult> {
		const fileBuffer = await fs.readFile(filePath)
		const filename = path.basename(filePath)
		const formData = new FormData()
		formData.append("project", project)
		formData.append("file", new Blob([fileBuffer]), filename)

		const response = await fetch(`${this.serverUrl}/upload`, {
			method: "POST",
			body: formData,
		})

		if (!response.ok) {
			throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
		}

		return (await response.json()) as UploadResult
	}

	async createProject(name: string, mountPath: string): Promise<{ name: string; mount_path: string; status: string; message: string }> {
		const response = await fetch(`${this.serverUrl}/projects`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, mount_path: mountPath }),
		})

		if (!response.ok) {
			throw new Error(`Create project failed: ${response.status} ${response.statusText}`)
		}

		return await response.json()
	}

	async listDocuments(
		project: string,
		page = 1,
		pageSize = 20,
	): Promise<{
		project: string
		page: number
		page_size: number
		total: number
		total_pages: number
		documents: Array<{ path: string; file_type: string; chunks: number; size: number; mod_time: string }>
	}> {
		const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/documents?${params}`)

		if (!response.ok) {
			throw new Error(`List documents failed: ${response.status} ${response.statusText}`)
		}

		return await response.json()
	}

	async deleteDocument(
		project: string,
		path: string,
	): Promise<{ project: string; path: string; chunks_removed: number; file_deleted: boolean; status: string }> {
		const params = new URLSearchParams({ path })
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/documents?${params}`, {
			method: "DELETE",
		})

		if (!response.ok) {
			throw new Error(`Delete document failed: ${response.status} ${response.statusText}`)
		}

		return await response.json()
	}

	async startIndexProject(project: string): Promise<{ job_id: string; project: string; status: string; started_at: string }> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/index`, {
			method: "POST",
		})

		if (!response.ok) {
			throw new Error(`Start index failed: ${response.status} ${response.statusText}`)
		}

		return await response.json()
	}

	async startIndexUrl(
		project: string,
		url: string,
		depth?: number,
		maxPages?: number,
	): Promise<{ job_id: string; project: string; status: string; started_at: string }> {
		const body: Record<string, unknown> = { url }
		if (depth !== undefined) body.depth = depth
		if (maxPages !== undefined) body.max_pages = maxPages

		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/index-url`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		})

		if (!response.ok) {
			throw new Error(`Start URL index failed: ${response.status} ${response.statusText}`)
		}

		return await response.json()
	}

	async pollIndexJob(
		project: string,
		jobId: string,
	): Promise<{
		id: string
		job_id: string
		project: string
		type: string
		status: string
		started_at: string
		finished_at: string
		files_scanned: number
		files_indexed: number
		files_failed: number
		chunks_added: number
		error: string
	}> {
		const response = await fetch(
			`${this.serverUrl}/projects/${encodeURIComponent(project)}/jobs/${encodeURIComponent(jobId)}`,
		)

		if (!response.ok) {
			throw new Error(`Poll job failed: ${response.status} ${response.statusText}`)
		}

		return await response.json()
	}

	async close(): Promise<void> {
		if (this.client) {
			try {
				await this.client.close()
			} catch (err) {
				Logger.error("VesselIndexerClient close error:", err)
			}
			this.client = null
		}
	}
}
