import { describe, expect, mock, test } from "bun:test"

mock.module("vscode", () => ({
	window: {
		showOpenDialog: mock(async () => [{ fsPath: "/mock/test.pdf" }]),
	},
	Uri: { parse: (s: string) => ({ fsPath: s }) },
}))

mock.module("@/shared/services/Logger", () => ({
	Logger: { log: mock(() => {}), error: mock(() => {}) },
}))

// Mock VesselIndexerClient
const mockCallTool = mock(async (toolName: string, args: Record<string, unknown>) => {
	if (toolName === "list_projects") {
		return {
			projects: [
				{ name: "greenenergy", mount_path: "/data/projects/greenenergy", total_chunks: 279, status: "indexed" },
			],
		}
	}
	if (toolName === "project_stats") {
		return { project: "greenenergy", total_chunks: 279, files_indexed: 2, by_format: { pdf: 278, txt: 1 } }
	}
	if (toolName === "index_project") {
		return { files_scanned: 3, files_indexed: 1, files_failed: 0, chunks_added: 278, elapsed_ms: 6271 }
	}
	if (toolName === "search_documents") {
		return {
			project: "greenenergy",
			query: "OCPP",
			results: [{ text: "OCPP specification...", score: 0.862, hybrid_score: 0.827, metadata: { path: "...", page: 3 } }],
		}
	}
	return {}
})

mock.module("../VesselIndexerClient", () => ({
	VesselIndexerClient: class MockVesselIndexerClient {
		connect = mock(async () => {})
		callTool = mockCallTool
		uploadFile = mock(async () => ({
			project: "greenenergy",
			filename: "doc.pdf",
			path: "/data/projects/greenenergy/doc.pdf",
			size: 1048576,
			status: "indexed",
		}))
		close = mock(async () => {})
	},
}))

mock.module("@services/mcp/settingsLock", () => ({
	updateMcpSettingsFile: mock(async () => {}),
}))

const { DocsIndexFacade } = await import("../DocsIndexFacade")

describe("DocsIndexFacade", () => {
	test("ping returns connected=true when list_projects succeeds", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.ping("http://localhost:20130")
		expect(result.connected).toBe(true)
	})

	test("listProjects maps snake_case to camelCase proto fields", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.listProjects("http://localhost:20130")
		expect(result.projects.length).toBe(1)
		expect(result.projects[0].name).toBe("greenenergy")
		expect(result.projects[0].mountPath).toBe("/data/projects/greenenergy")
		expect(result.projects[0].totalChunks).toBe(279)
	})

	test("projectStats maps by_format map correctly", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.projectStats("http://localhost:20130", "greenenergy")
		expect(result.totalChunks).toBe(279)
		expect(result.filesIndexed).toBe(2)
		expect(result.byFormat["pdf"]).toBe(278)
	})

	test("indexDocsProject maps response fields", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.indexDocsProject("http://localhost:20130", "greenenergy")
		expect(result.filesScanned).toBe(3)
		expect(result.filesIndexed).toBe(1)
		expect(result.chunksAdded).toBe(278)
		expect(result.elapsedMs).toBe(6271)
	})

	test("searchDocuments maps results with metadata as JSON string", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.searchDocuments("http://localhost:20130", "greenenergy", "OCPP", 10)
		expect(result.results.length).toBe(1)
		expect(result.results[0].score).toBe(0.862)
		expect(result.results[0].metadata).toContain("page")
	})

	test("listDocsIndexTools returns 6 tools", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = facade.listDocsIndexTools()
		expect(result.tools.length).toBe(6)
		expect(result.tools[0].name).toBe("search_documents")
	})
})
