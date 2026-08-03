import { describe, expect, mock, test } from "bun:test"

mock.module("@/shared/services/Logger", () => ({
	Logger: { log: mock(() => {}), error: mock(() => {}) },
}))

mock.module("../VesselIndexerClient", () => ({
	VesselIndexerClient: class MockVesselIndexerClient {
		listProjects = mock(async () => ({ projects: ["greenenergy", "acme"] }))
		createProject = mock(async (name: string) => ({ status: "ok", project: name }))
		uploadFile = mock(async () => ({ task_id: "task-1" }))
		indexUrl = mock(async () => ({ task_id: "task-2" }))
		search = mock(async (_project: string, _query: string, _topK: number) => ({
			project: "greenenergy",
			total_results: 1,
			results: [{ score: 0.86, doc_id: "d1", source_name: "spec.pdf", page: 3, chunk_index: 7, text: "OCPP..." }],
		}))
		getTask = mock(async (id: string) => ({
			id,
			project: "greenenergy",
			status: "running",
			progress: 0.5,
			message: "indexing",
			detail: null,
		}))
		deleteDocument = mock(async () => ({ status: "ok" }))
	},
}))

const { DocsIndexFacade } = await import("../DocsIndexFacade")
const newFacade = () => new DocsIndexFacade({ getMcpSettingsFilePath: async () => "/tmp/test.json" } as any)

describe("DocsIndexFacade", () => {
	test("listProjects maps string names to ProjectInfo", async () => {
		const res = await newFacade().listProjects("http://localhost:20130")
		expect(res.projects.map((p) => p.name)).toEqual(["greenenergy", "acme"])
	})

	test("createProject returns project + status", async () => {
		const res = await newFacade().createProject("http://localhost:20130", "greenenergy")
		expect(res.project).toBe("greenenergy")
		expect(res.status).toBe("ok")
	})

	test("uploadFile surfaces task id", async () => {
		const res = await newFacade().uploadFile("http://localhost:20130", "greenenergy", "/tmp/x.pdf")
		expect(res.taskId).toBe("task-1")
	})

	test("indexUrl surfaces task id", async () => {
		const res = await newFacade().indexUrl("http://localhost:20130", "greenenergy", "https://example.com")
		expect(res.taskId).toBe("task-2")
	})

	test("getTask maps TaskInfo fields", async () => {
		const res = await newFacade().getTask("http://localhost:20130", "task-1")
		expect(res.status).toBe("running")
		expect(res.progress).toBeCloseTo(0.5)
	})

	test("searchDocuments maps SearchHit fields", async () => {
		const res = await newFacade().searchDocuments("http://localhost:20130", "greenenergy", "OCPP", 5)
		expect(res.results[0].docId).toBe("d1")
		expect(res.results[0].sourceName).toBe("spec.pdf")
		expect(res.results[0].page).toBe(3)
	})

	test("deleteDocument returns ok status", async () => {
		const res = await newFacade().deleteDocument("http://localhost:20130", "greenenergy", "spec.pdf")
		expect(res.status).toBe("ok")
	})
})
