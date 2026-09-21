import { beforeEach, describe, it, mock } from "bun:test"
import { strict as assert } from "node:assert"
import { GetCrawlRequest, GetCrawlResponse } from "@shared/proto/cline/docs_index"
import { getCrawl } from "../getCrawl"

describe("getCrawl controller handler", () => {
	const facade = { getCrawl: mock() }
	const controller: any = { docsIndex: facade }

	beforeEach(() => facade.getCrawl.mockClear())

	it("delegates to facade and returns the response", async () => {
		const resp = GetCrawlResponse.create({})
		facade.getCrawl.mockResolvedValue(resp)
		const req = GetCrawlRequest.create({ serverUrl: "http://x", project: "p", crawlId: "c1" })
		assert.equal(await getCrawl(controller, req), resp)
		assert.equal(facade.getCrawl.mock.calls.length, 1)
		const [serverUrl, project, crawlId] = facade.getCrawl.mock.calls[0]
		assert.equal(serverUrl, "http://x")
		assert.equal(project, "p")
		assert.equal(crawlId, "c1")
	})

	it("forwards the crawlId to the facade", async () => {
		facade.getCrawl.mockResolvedValue(GetCrawlResponse.create({}))
		const req = GetCrawlRequest.create({ serverUrl: "http://x", project: "p", crawlId: "abc" })
		await getCrawl(controller, req)
		assert.equal(facade.getCrawl.mock.calls[0][2], "abc")
	})
})
