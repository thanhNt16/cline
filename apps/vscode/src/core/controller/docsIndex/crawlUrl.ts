import { CrawlUrlRequest, CrawlUrlResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function crawlUrl(controller: Controller, request: CrawlUrlRequest): Promise<CrawlUrlResponse> {
	return await controller.docsIndex.crawlUrl(
		request.serverUrl,
		request.project,
		request.url,
		request.maxDepth,
		request.maxPages,
	)
}
