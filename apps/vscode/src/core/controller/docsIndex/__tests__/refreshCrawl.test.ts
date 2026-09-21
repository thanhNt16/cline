import { beforeEach, describe, it, mock } from "bun:test"
import { strict as assert } from "node:assert"
import { RefreshCrawlRequest, RefreshCrawlResponse } from "@shared/proto/cline/docs_index"
import { refreshCrawl } from "../refreshCrawl"

describe("refreshCrawl controller handler", () => {
	const facade = { refreshCrawl: mock() }
	const controller: any = { docsIndex: facade }

	beforeEach(() => facade.refreshCrawl.mockClear())

	it("delegates to facade and returns the response", async () => {
		const resp = RefreshCrawlResponse.create({ taskId: "t9" })
		facade.refreshCrawl.mockResolvedValue(resp)
		const req = RefreshCrawlRequest.create({ serverUrl: "http://x", project: "p", crawlId: "c1" })
		assert.equal(await refreshCrawl(controller, req), resp)
		assert.equal(facade.refreshCrawl.mock.calls.length, 1)
		const [serverUrl, project, crawlId] = facade.refreshCrawl.mock.calls[0]
		assert.equal(serverUrl, "http://x")
		assert.equal(project, "p")
		assert.equal(crawlId, "c1")
	})
})
