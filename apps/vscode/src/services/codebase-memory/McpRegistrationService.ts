import type { McpHub } from "@services/mcp/McpHub"
import { updateMcpSettingsFile } from "@services/mcp/settingsLock"
import { Logger } from "@/shared/services/Logger"
import { MCP_SERVER_KEY } from "./constants"

export class McpRegistrationService {
	constructor(
		private readonly mcpHub: McpHub,
		private readonly binaryPath: string,
	) {}

	async isRegistered(): Promise<boolean> {
		const settingsPath = await this.mcpHub.getMcpSettingsFilePath()
		Logger.log(`[CBM-DIAG] isRegistered: settingsPath=${settingsPath} expectedBinaryPath=${this.binaryPath}`)
		const fs = await import("node:fs/promises")
		try {
			const content = await fs.readFile(settingsPath, "utf8")
			const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> }
			const entry = parsed.mcpServers?.[MCP_SERVER_KEY] as { command?: string } | undefined
			Logger.log(`[CBM-DIAG] isRegistered: entry=${JSON.stringify(entry)} match=${entry?.command === this.binaryPath}`)
			return !!entry && entry.command === this.binaryPath
		} catch (e) {
			Logger.log(`[CBM-DIAG] isRegistered: error reading settings: ${(e as Error).message}`)
			return false
		}
	}

	async register(): Promise<void> {
		const settingsPath = await this.mcpHub.getMcpSettingsFilePath()
		const binPath = this.binaryPath
		Logger.log(`[CBM-DIAG] register: writing to ${settingsPath} binaryPath=${binPath}`)
		await updateMcpSettingsFile(settingsPath, (settings) => {
			if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
				settings.mcpServers = {}
			}
			const servers = settings.mcpServers as Record<string, unknown>
			const existing = servers[MCP_SERVER_KEY] as { command?: string; autoApprove?: string[] } | undefined
			if (existing && existing.command === binPath) {
				return
			}
			servers[MCP_SERVER_KEY] = {
				command: binPath,
				args: [] as string[],
				disabled: false,
				autoApprove: existing?.autoApprove ?? [],
			}
		})
		Logger.log(`[CBM-DIAG] register: done writing to ${settingsPath}`)
	}

	async unregister(): Promise<void> {
		const settingsPath = await this.mcpHub.getMcpSettingsFilePath()
		await updateMcpSettingsFile(settingsPath, (settings) => {
			if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
				return
			}
			const servers = settings.mcpServers as Record<string, unknown>
			delete servers[MCP_SERVER_KEY]
		})
	}
}
