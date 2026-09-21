import { describe, expect, mock, test } from "bun:test"

// path → settings object, captured across all updateMcpSettingsFile calls
const writes: Map<string, Record<string, unknown>> = new Map()

mock.module("@services/mcp/settingsLock", () => ({
	updateMcpSettingsFile: mock(async (path: string, mutator: (settings: Record<string, unknown>) => void) => {
		const settings = writes.get(path) ?? { mcpServers: {} }
		writes.set(path, settings)
		mutator(settings)
	}),
}))

// Mock fs.readFile so isRegistered and getSelectedProject can read from the `writes` Map
mock.module("node:fs/promises", () => ({
	readFile: mock(async (path: string) => {
		const data = writes.get(path)
		if (!data) throw new Error("ENOENT")
		return JSON.stringify(data)
	}),
}))

const { McpRegistrationService } = await import("../McpRegistrationService")
const { MCP_SERVER_KEY } = await import("../constants")

// Hub mock: projectLevel=true → workspace path, else global path.
const WS_PATH = "/tmp/test-ws.json"
const GLOBAL_PATH = "/tmp/test-global.json"
const fakeHub = {
	resolveMcpWriteFilePath: async (_name?: string, projectLevel?: boolean) => (projectLevel ? WS_PATH : GLOBAL_PATH),
}

describe("McpRegistrationService", () => {
	test("register writes the docindex entry to the workspace file", async () => {
		writes.clear()
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.register("http://localhost:20130")
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		expect(wsServers[MCP_SERVER_KEY]).toBeDefined()
		expect(wsServers[MCP_SERVER_KEY].type).toBe("streamableHttp")
		expect(wsServers[MCP_SERVER_KEY].url).toBe("http://localhost:20130/mcp")
		expect(wsServers[MCP_SERVER_KEY].disabled).toBe(false)
	})

	test("register removes legacy vessel-indexer / server-docs-index entries from both files", async () => {
		writes.clear()
		// seed legacy entries in both files
		writes.set(WS_PATH, { mcpServers: { "vessel-indexer": { url: "http://x/mcp" } } })
		writes.set(GLOBAL_PATH, { mcpServers: { "server-docs-index": { url: "http://x/mcp" } } })
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.register("http://localhost:20130")
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		const globalServers = (writes.get(GLOBAL_PATH) as any)?.mcpServers
		expect(wsServers["vessel-indexer"]).toBeUndefined()
		expect(globalServers["server-docs-index"]).toBeUndefined()
		expect(wsServers[MCP_SERVER_KEY]).toBeDefined()
	})

	test("unregister removes the docindex entry from the workspace file", async () => {
		writes.clear()
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.register("http://localhost:20130")
		await svc.unregister()
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		expect(wsServers[MCP_SERVER_KEY]).toBeUndefined()
	})

	// --- metadata / selectedProject tests ---

	test("register with selectedProject writes metadata.project on the entry", async () => {
		writes.clear()
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.register("http://localhost:20130", "projX")
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		expect(wsServers[MCP_SERVER_KEY].metadata).toEqual({ project: "projX" })
	})

	test("register without selectedProject preserves existing metadata.project", async () => {
		writes.clear()
		// seed existing entry with metadata.project = "old"
		writes.set(WS_PATH, {
			mcpServers: {
				[MCP_SERVER_KEY]: { type: "streamableHttp", url: "http://localhost:20130/mcp", metadata: { project: "old" } },
			},
		})
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.register("http://localhost:20130")
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		expect(wsServers[MCP_SERVER_KEY].metadata.project).toBe("old")
	})

	test("register without selectedProject and no existing entry has no metadata", async () => {
		writes.clear()
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.register("http://localhost:20130")
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		expect(wsServers[MCP_SERVER_KEY].metadata).toBeUndefined()
	})

	test("setSelectedProject sets metadata.project and preserves other metadata keys", async () => {
		writes.clear()
		// seed entry with metadata.foo = "bar"
		writes.set(WS_PATH, {
			mcpServers: {
				[MCP_SERVER_KEY]: { type: "streamableHttp", url: "http://localhost:20130/mcp", metadata: { foo: "bar" } },
			},
		})
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.setSelectedProject("projY")
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		expect(wsServers[MCP_SERVER_KEY].metadata.project).toBe("projY")
		expect(wsServers[MCP_SERVER_KEY].metadata.foo).toBe("bar")
	})

	test("setSelectedProject is no-op when no docindex entry exists", async () => {
		writes.clear()
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.setSelectedProject("projY")
		const wsServers = (writes.get(WS_PATH) as any)?.mcpServers
		expect(wsServers?.[MCP_SERVER_KEY]).toBeUndefined()
	})

	test("getSelectedProject returns project string when present", async () => {
		writes.clear()
		writes.set(WS_PATH, {
			mcpServers: {
				[MCP_SERVER_KEY]: { type: "streamableHttp", url: "http://localhost:20130/mcp", metadata: { project: "myProj" } },
			},
		})
		const svc = new McpRegistrationService(fakeHub as any)
		expect(await svc.getSelectedProject()).toBe("myProj")
	})

	test("getSelectedProject returns undefined when entry absent", async () => {
		writes.clear()
		const svc = new McpRegistrationService(fakeHub as any)
		expect(await svc.getSelectedProject()).toBeUndefined()
	})

	test("getSelectedProject returns undefined when metadata absent", async () => {
		writes.clear()
		writes.set(WS_PATH, {
			mcpServers: {
				[MCP_SERVER_KEY]: { type: "streamableHttp", url: "http://localhost:20130/mcp" },
			},
		})
		const svc = new McpRegistrationService(fakeHub as any)
		expect(await svc.getSelectedProject()).toBeUndefined()
	})

	test("getSelectedProject returns undefined when metadata.project is not a string", async () => {
		writes.clear()
		writes.set(WS_PATH, {
			mcpServers: {
				[MCP_SERVER_KEY]: { type: "streamableHttp", url: "http://localhost:20130/mcp", metadata: { project: 42 } },
			},
		})
		const svc = new McpRegistrationService(fakeHub as any)
		expect(await svc.getSelectedProject()).toBeUndefined()
	})

	test("isRegistered still works after metadata is added", async () => {
		writes.clear()
		const svc = new McpRegistrationService(fakeHub as any)
		await svc.register("http://localhost:20130", "projX")
		expect(await svc.isRegistered("http://localhost:20130")).toBe(true)
	})
})
