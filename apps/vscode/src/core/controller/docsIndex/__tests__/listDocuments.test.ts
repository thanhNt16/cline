import { beforeEach, describe, it, mock } from "bun:test"
import { strict as assert } from "node:assert"
import { ListDocumentsRequest, ListDocumentsResponse } from "@shared/proto/cline/docs_index"
import { listDocuments } from "../listDocuments"

describe("listDocuments controller handler", () => {
	const facade = { listDocuments: mock() }
	const controller: any = { docsIndex: facade }

	beforeEach(() => facade.listDocuments.mockClear())

	it("delegates to facade and returns the response", async () => {
		const resp = ListDocumentsResponse.create({ documents: [{ source: "a.pdf", url: "/projects/p/documents/a.pdf/file" }] })
		facade.listDocuments.mockResolvedValue(resp)
		const req = ListDocumentsRequest.create({ serverUrl: "http://x", project: "p" })
		assert.equal(await listDocuments(controller, req), resp)
		assert.equal(facade.listDocuments.mock.calls.length, 1)
		const [serverUrl, project] = facade.listDocuments.mock.calls[0]
		assert.equal(serverUrl, "http://x")
		assert.equal(project, "p")
	})
})
