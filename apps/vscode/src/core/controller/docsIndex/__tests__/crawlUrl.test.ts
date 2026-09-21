import { beforeEach, describe, it, mock } from "bun:test"
import { strict as assert } from "node:assert"
import { CrawlUrlRequest, CrawlUrlResponse } from "@shared/proto/cline/docs_index"
import { crawlUrl } from "../crawlUrl"

describe("crawlUrl controller handler", () => {
	const facade = { crawlUrl: mock() }
	const controller: any = { docsIndex: facade }

	beforeEach(() => facade.crawlUrl.mockClear())

	it("delegates to facade and returns the response", async () => {
		const resp = CrawlUrlResponse.create({ crawlId: "c1", taskId: "t1", project: "p", status: "accepted" })
		facade.crawlUrl.mockResolvedValue(resp)
		const req = CrawlUrlRequest.create({ serverUrl: "http://x", project: "p", url: "https://x.io" })
		assert.equal(await crawlUrl(controller, req), resp)
		assert.equal(facade.crawlUrl.mock.calls.length, 1)
		const [serverUrl, project, url, maxDepth, maxPages] = facade.crawlUrl.mock.calls[0]
		assert.equal(serverUrl, "http://x")
		assert.equal(project, "p")
		assert.equal(url, "https://x.io")
		assert.equal(maxDepth, 0)
		assert.equal(maxPages, 0)
	})

	it("forwards maxDepth and maxPages to the facade", async () => {
		const resp = CrawlUrlResponse.create({ crawlId: "c1", taskId: "t1", project: "p", status: "accepted" })
		facade.crawlUrl.mockResolvedValue(resp)
		const req = CrawlUrlRequest.create({
			serverUrl: "http://x",
			project: "p",
			url: "https://x.io",
			maxDepth: 3,
			maxPages: 50,
		})
		await crawlUrl(controller, req)
		assert.equal(facade.crawlUrl.mock.calls[0][3], 3)
		assert.equal(facade.crawlUrl.mock.calls[0][4], 50)
	})
})
