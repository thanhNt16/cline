import type { McpHub } from "@services/mcp/McpHub"
import { updateMcpSettingsFile } from "@services/mcp/settingsLock"
import { Logger } from "@/shared/services/Logger"
import { MCP_SERVER_KEY } from "./constants"

export class McpRegistrationService {
	constructor(private readonly mcpHub: McpHub) {}

	async isRegistered(serverUrl: string): Promise<boolean> {
		const settingsPath = await this.mcpHub.getMcpSettingsFilePath()
		const fs = await import("node:fs/promises")
		try {
			const content = await fs.readFile(settingsPath, "utf8")
			const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> }
			const entry = parsed.mcpServers?.[MCP_SERVER_KEY] as { url?: string; type?: string } | undefined
			const expectedUrl = `${serverUrl}/mcp`
			return !!entry && entry.url === expectedUrl && entry.type === "streamableHttp"
		} catch {
			return false
		}
	}

	async register(serverUrl: string): Promise<void> {
		const settingsPath = await this.mcpHub.getMcpSettingsFilePath()
		const mcpUrl = `${serverUrl}/mcp`
		Logger.log(`[DocsIndex] register: writing to ${settingsPath} url=${mcpUrl}`)
		await updateMcpSettingsFile(settingsPath, (settings) => {
			if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
				settings.mcpServers = {}
			}
			const servers = settings.mcpServers as Record<string, unknown>
			const existing = servers[MCP_SERVER_KEY] as { autoApprove?: string[] } | undefined
			servers[MCP_SERVER_KEY] = {
				type: "streamableHttp",
				url: mcpUrl,
				disabled: false,
				autoApprove: existing?.autoApprove ?? [],
			}
		})
	}

	async unregister(): Promise<void> {
		const settingsPath = await this.mcpHub.getMcpSettingsFilePath()
		Logger.log(`[DocsIndex] unregister: removing from ${settingsPath}`)
		await updateMcpSettingsFile(settingsPath, (settings) => {
			if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
				return
			}
			const servers = settings.mcpServers as Record<string, unknown>
			delete servers[MCP_SERVER_KEY]
		})
	}
}
