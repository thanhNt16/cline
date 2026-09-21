import type { McpHub } from "@services/mcp/McpHub"
import { updateMcpSettingsFile } from "@services/mcp/settingsLock"
import { Logger } from "@/shared/services/Logger"
import { MCP_SERVER_KEY } from "./constants"

// The docindex MCP server was previously registered under these names. They are
// removed from every writable settings file on register() so a rename doesn't
// leave a duplicate connection to the same URL.
const LEGACY_MCP_KEYS = ["vessel-indexer", "server-docs-index"]

export class McpRegistrationService {
	constructor(private readonly mcpHub: McpHub) {}

	async isRegistered(serverUrl: string): Promise<boolean> {
		const settingsPath = await this.mcpHub.resolveMcpWriteFilePath(MCP_SERVER_KEY, true)
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

	async register(serverUrl: string, selectedProject?: string): Promise<void> {
		const settingsPath = await this.mcpHub.resolveMcpWriteFilePath(MCP_SERVER_KEY, true)
		const mcpUrl = `${serverUrl}/mcp`
		Logger.log(`[DocsIndex] register: writing to ${settingsPath} url=${mcpUrl}`)
		await this.removeLegacyEntries()
		await updateMcpSettingsFile(settingsPath, (settings) => {
			if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
				settings.mcpServers = {}
			}
			const servers = settings.mcpServers as Record<string, unknown>
			const existing = servers[MCP_SERVER_KEY] as { autoApprove?: string[]; metadata?: { project?: string } } | undefined
			const entry: Record<string, unknown> = {
				type: "streamableHttp",
				url: mcpUrl,
				disabled: false,
				autoApprove: existing?.autoApprove ?? [],
			}
			if (selectedProject) {
				entry.metadata = { project: selectedProject }
			} else if (existing?.metadata?.project) {
				entry.metadata = { project: existing.metadata.project }
			}
			servers[MCP_SERVER_KEY] = entry
		})
	}

	async setSelectedProject(project: string): Promise<void> {
		const settingsPath = await this.mcpHub.resolveMcpWriteFilePath(MCP_SERVER_KEY, true)
		await updateMcpSettingsFile(settingsPath, (settings) => {
			if (!settings.mcpServers || typeof settings.mcpServers !== "object") return
			const servers = settings.mcpServers as Record<string, unknown>
			const entry = servers[MCP_SERVER_KEY] as Record<string, unknown> | undefined
			if (!entry) return
			const existing = entry.metadata as Record<string, unknown> | undefined
			entry.metadata = { ...(existing ?? {}), project }
		})
	}

	async getSelectedProject(): Promise<string | undefined> {
		const settingsPath = await this.mcpHub.resolveMcpWriteFilePath(MCP_SERVER_KEY, true)
		const fs = await import("node:fs/promises")
		try {
			const content = await fs.readFile(settingsPath, "utf8")
			const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> }
			const entry = parsed.mcpServers?.[MCP_SERVER_KEY] as { metadata?: unknown } | undefined
			if (typeof entry?.metadata === "object" && entry.metadata !== null) {
				const meta = entry.metadata as { project?: unknown }
				if (typeof meta.project === "string") return meta.project
			}
			return undefined
		} catch {
			return undefined
		}
	}

	async unregister(): Promise<void> {
		const settingsPath = await this.mcpHub.resolveMcpWriteFilePath(MCP_SERVER_KEY, true)
		Logger.log(`[DocsIndex] unregister: removing from ${settingsPath}`)
		await updateMcpSettingsFile(settingsPath, (settings) => {
			if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
				return
			}
			const servers = settings.mcpServers as Record<string, unknown>
			delete servers[MCP_SERVER_KEY]
		})
	}

	/**
	 * Remove legacy server names (vessel-indexer / server-docs-index) from both the
	 * global and workspace settings files. Paths are resolved through the hub so the
	 * logic is mockable and never touches the user's real home dir from unit tests.
	 */
	private async removeLegacyEntries(): Promise<void> {
		const paths = new Set<string>([
			await this.mcpHub.resolveMcpWriteFilePath(undefined), // global (no serverName → global)
			await this.mcpHub.resolveMcpWriteFilePath(MCP_SERVER_KEY, true), // workspace
		])
		for (const p of paths) {
			await updateMcpSettingsFile(p, (settings) => {
				if (!settings.mcpServers || typeof settings.mcpServers !== "object") return
				const servers = settings.mcpServers as Record<string, unknown>
				for (const legacy of LEGACY_MCP_KEYS) {
					delete servers[legacy]
				}
			}).catch((err) => Logger.error("[DocsIndex] legacy entry cleanup failed:", err))
		}
	}
}
