import { describe, expect, mock, test } from "bun:test"

mock.module("@/shared/services/Logger", () => ({
	Logger: { log: mock(() => {}), error: mock(() => {}) },
}))

// Mock VesselIndexerClient
const mockCallTool = mock(async (toolName: string, args: Record<string, unknown>) => {
	if (toolName === "list_projects") {
		return {
			projects: ["greenenergy"],
		}
	}
	if (toolName === "search") {
		return {
			project: "greenenergy",
			query: "OCPP",
			results: [{ score: 0.862, doc_id: "doc-1", source_name: "spec.pdf", page: 3, chunk_index: 0, text: "OCPP specification..." }],
		}
	}
	return {}
})

mock.module("../VesselIndexerClient", () => ({
	VesselIndexerClient: class MockVesselIndexerClient {
		connect = mock(async () => {})
		callTool = mockCallTool
		uploadFile = mock(async () => ({
			task_id: "task-789",
		}))
		createProject = mock(async (name: string) => ({
			project: name,
			status: "ok",
		}))
		indexUrl = mock(async (project: string, url: string) => ({
			task_id: "task-456",
		}))
		getTask = mock(async (taskId: string) => ({
			id: taskId,
			project: "greenenergy",
			status: "completed",
			progress: 1,
			message: "done",
			detail: "",
		}))
		deleteDocument = mock(async (project: string, source: string) => ({
			status: "ok",
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

	test("listProjects returns ProjectInfo with name strings", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.listProjects("http://localhost:20130")
		expect(result.projects.length).toBe(1)
		expect(result.projects[0].name).toBe("greenenergy")
	})

	test("searchDocuments returns SearchResult with new fields", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.searchDocuments("http://localhost:20130", "greenenergy", "OCPP", 10)
		expect(result.results.length).toBe(1)
		expect(result.results[0].score).toBe(0.862)
		expect(result.results[0].docId).toBe("doc-1")
		expect(result.results[0].sourceName).toBe("spec.pdf")
	})

	test("createProject calls client and returns CreateProjectResponse", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.createProject("http://localhost:20130", "greenenergy")
		expect(result.project).toBe("greenenergy")
		expect(result.status).toBe("ok")
	})

	test("uploadFile returns taskId", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.uploadFile("http://localhost:20130", "greenenergy", "/tmp/doc.pdf")
		expect(result.taskId).toBe("task-789")
		expect(result.status).toBe("accepted")
	})

	test("getTask returns task status", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = await facade.getTask("http://localhost:20130", "task-123")
		expect(result.id).toBe("task-123")
		expect(result.status).toBe("completed")
	})

	test("listDocsIndexTools returns 7 tools", async () => {
		const facade = new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)
		const result = facade.listDocsIndexTools()
		expect(result.tools.length).toBe(7)
		expect(result.tools[0].name).toBe("create_project")
	})
})
