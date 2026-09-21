import { RefreshCrawlRequest, RefreshCrawlResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function refreshCrawl(controller: Controller, request: RefreshCrawlRequest): Promise<RefreshCrawlResponse> {
	return await controller.docsIndex.refreshCrawl(request.serverUrl, request.project, request.crawlId)
}
