import { beforeEach, describe, it, mock } from "bun:test"
import { strict as assert } from "node:assert"
import { DeleteCrawlRequest, DeleteCrawlResponse } from "@shared/proto/cline/docs_index"
import { deleteCrawl } from "../deleteCrawl"

describe("deleteCrawl controller handler", () => {
	const facade = { deleteCrawl: mock() }
	const controller: any = { docsIndex: facade }

	beforeEach(() => facade.deleteCrawl.mockClear())

	it("delegates to facade and returns the response", async () => {
		const resp = DeleteCrawlResponse.create({ status: "deleted" })
		facade.deleteCrawl.mockResolvedValue(resp)
		const req = DeleteCrawlRequest.create({ serverUrl: "http://x", project: "p", crawlId: "c1" })
		assert.equal(await deleteCrawl(controller, req), resp)
		assert.equal(facade.deleteCrawl.mock.calls.length, 1)
		const [serverUrl, project, crawlId] = facade.deleteCrawl.mock.calls[0]
		assert.equal(serverUrl, "http://x")
		assert.equal(project, "p")
		assert.equal(crawlId, "c1")
	})

	it("forwards the crawlId to the facade", async () => {
		facade.deleteCrawl.mockResolvedValue(DeleteCrawlResponse.create({ status: "deleted" }))
		const req = DeleteCrawlRequest.create({ serverUrl: "http://x", project: "p", crawlId: "abc" })
		await deleteCrawl(controller, req)
		assert.equal(facade.deleteCrawl.mock.calls[0][2], "abc")
	})
})
