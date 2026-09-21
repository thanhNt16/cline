import { beforeEach, describe, it, mock } from "bun:test"
import { strict as assert } from "node:assert"
import { ListCrawlsRequest, ListCrawlsResponse } from "@shared/proto/cline/docs_index"
import { listCrawls } from "../listCrawls"

describe("listCrawls controller handler", () => {
	const facade = { listCrawls: mock() }
	const controller: any = { docsIndex: facade }

	beforeEach(() => facade.listCrawls.mockClear())

	it("delegates to facade and returns the response", async () => {
		const resp = ListCrawlsResponse.create({ crawls: [] })
		facade.listCrawls.mockResolvedValue(resp)
		const req = ListCrawlsRequest.create({ serverUrl: "http://x", project: "p" })
		assert.equal(await listCrawls(controller, req), resp)
		assert.equal(facade.listCrawls.mock.calls.length, 1)
		const [serverUrl, project] = facade.listCrawls.mock.calls[0]
		assert.equal(serverUrl, "http://x")
		assert.equal(project, "p")
	})
})
