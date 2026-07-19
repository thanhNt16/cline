import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { Logger } from "@/shared/services/Logger"

export interface TaskInfo {
	id: string
	project: string
	status: string
	progress: number
	message: string
	detail?: string | null
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
		if (!this.client) await this.connect()
		const result = await this.client!.request(
			{ method: "tools/call", params: { name: toolName, arguments: args } },
			CallToolResultSchema,
		)
		const textContent = result.content?.find((c: any) => c.type === "text") as { text: string } | undefined
		if (!textContent?.text) throw new Error(`Tool ${toolName} returned no text content`)
		try {
			return JSON.parse(textContent.text)
		} catch {
			return textContent.text
		}
	}

	async createProject(name: string): Promise<{ status: string; project: string }> {
		const params = new URLSearchParams({ project: name })
		const response = await fetch(`${this.serverUrl}/projects?${params}`, { method: "POST" })
		if (!response.ok) throw new Error(`Create project failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async uploadFile(project: string, filePath: string): Promise<{ task_id: string }> {
		const fileBuffer = await fs.readFile(filePath)
		const filename = path.basename(filePath)
		const formData = new FormData()
		formData.append("file", new Blob([fileBuffer]), filename)
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/documents`, {
			method: "POST",
			body: formData,
		})
		if (!response.ok) throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async indexUrl(project: string, url: string): Promise<{ task_id: string }> {
		const response = await fetch(`${this.serverUrl}/projects/${encodeURIComponent(project)}/urls`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		})
		if (!response.ok) throw new Error(`Index URL failed: ${response.status} ${response.statusText}`)
		return await response.json()
	}

	async getTask(taskId: string): Promise<TaskInfo> {
		const response = await fetch(`${this.serverUrl}/tasks/${encodeURIComponent(taskId)}`)
		if (!response.ok) throw new Error(`Get task failed: ${response.status} ${response.statusText}`)
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
