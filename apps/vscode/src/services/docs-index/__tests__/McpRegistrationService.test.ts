import { describe, expect, mock, test } from "bun:test"

let capturedSettings: Record<string, unknown> | null = null

mock.module("@services/mcp/settingsLock", () => ({
	updateMcpSettingsFile: mock(async (_path: string, mutator: (settings: Record<string, unknown>) => void) => {
		const settings: Record<string, unknown> = { mcpServers: {} }
		capturedSettings = settings
		mutator(settings)
	}),
}))

const { McpRegistrationService } = await import("../McpRegistrationService")
const { MCP_SERVER_KEY } = await import("../constants")

describe("McpRegistrationService", () => {
	test("register writes streamableHttp entry with correct URL", async () => {
		const svc = new McpRegistrationService({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		await svc.register("http://localhost:20130")
		const servers = (capturedSettings as any)?.mcpServers
		expect(servers[MCP_SERVER_KEY]).toBeDefined()
		expect(servers[MCP_SERVER_KEY].type).toBe("streamableHttp")
		expect(servers[MCP_SERVER_KEY].url).toBe("http://localhost:20130/mcp")
		expect(servers[MCP_SERVER_KEY].disabled).toBe(false)
	})

	test("unregister removes the entry", async () => {
		const svc = new McpRegistrationService({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		await svc.register("http://localhost:20130")
		await svc.unregister()
		const servers = (capturedSettings as any)?.mcpServers
		expect(servers[MCP_SERVER_KEY]).toBeUndefined()
	})
})
