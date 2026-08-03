import { strict as assert } from "node:assert"
import { describe, it } from "bun:test"
import { EmptyRequest } from "@shared/proto/cline/common"
import { getDocsIndexSettings } from "../getDocsIndexSettings"
import { updateDocsIndexSettings } from "../updateDocsIndexSettings"

// Handlers are thin: they resolve the workspace path on the controller, then
// delegate to DocsIndexFacade methods. The controller's docsIndex facade is a
// mock here, so the proto layer is exercised end-to-end (request decode +
// response encode) without touching disk.
const mockController = (workspacePath: string, overrides: Record<string, unknown> = {}) => ({
	docsIndex: {
		getWorkspacePath: async () => workspacePath,
		getDocsIndexSettings: async () => ({ serverUrl: "http://h:1", lastSelectedProject: "projA" }),
		updateDocsIndexSettings: async () => ({ serverUrl: "http://h:1", lastSelectedProject: "projA" }),
		...overrides,
	},
})

describe("getDocsIndexSettings handler", () => {
	it("encodes the facade result into the proto response", async () => {
		const res = await getDocsIndexSettings(mockController("/ws/a") as any, EmptyRequest.create())
		assert.equal(res.serverUrl, "http://h:1")
		assert.equal(res.lastSelectedProject, "projA")
	})

	it("passes the resolved workspace path to the facade read", async () => {
		let seen: string | undefined
		const controller = mockController("/ws/a", {
			getDocsIndexSettings: async (wp: string) => {
				seen = wp
				return { serverUrl: "http://h:1", lastSelectedProject: "projA" }
			},
		})
		await getDocsIndexSettings(controller as any, EmptyRequest.create())
		assert.equal(seen, "/ws/a")
	})

	it("returns empty last-selected when the facade reports none", async () => {
		const controller = mockController("/ws/a", {
			getDocsIndexSettings: async () => ({ serverUrl: "http://h:1", lastSelectedProject: "" }),
		})
		const res = await getDocsIndexSettings(controller as any, EmptyRequest.create())
		assert.equal(res.lastSelectedProject, "")
	})
})

describe("updateDocsIndexSettings handler", () => {
	it("threads request fields to the facade and encodes the response", async () => {
		let received: { workspacePath: string; serverUrl?: string; selectedProject?: string } | undefined
		const controller = mockController("/ws/a", {
			updateDocsIndexSettings: async (workspacePath: string, serverUrl?: string, selectedProject?: string) => {
				received = { workspacePath, serverUrl, selectedProject }
				return { serverUrl: "http://h:2", lastSelectedProject: "projB" }
			},
		})
		const res = await updateDocsIndexSettings(
			controller as any,
			{
				workspacePath: "/ws/a",
				serverUrl: "http://h:2",
				selectedProject: "projB",
			} as any,
		)
		assert.equal(received!.workspacePath, "/ws/a")
		assert.equal(received!.serverUrl, "http://h:2")
		assert.equal(received!.selectedProject, "projB")
		assert.equal(res.serverUrl, "http://h:2")
		assert.equal(res.lastSelectedProject, "projB")
	})

	it("forwards undefined optional fields when the caller omits them", async () => {
		// Mirrors the ProjectsCard "persist only selectedProject" call: serverUrl
		// is absent (optional proto field → undefined), so the facade must NOT
		// treat it as an empty-string overwrite.
		let receivedServerUrl: unknown = "sentinel"
		const controller = mockController("/ws/a", {
			updateDocsIndexSettings: async (_wp: string, serverUrl?: string) => {
				receivedServerUrl = serverUrl
				return { serverUrl: "http://kept:1", lastSelectedProject: "projC" }
			},
		})
		await updateDocsIndexSettings(
			controller as any,
			{
				workspacePath: "/ws/a",
				selectedProject: "projC",
			} as any,
		)
		assert.equal(receivedServerUrl, undefined, "absent optional server_url must reach the facade as undefined")
	})
})
