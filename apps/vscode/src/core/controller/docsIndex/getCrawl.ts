import { GetCrawlRequest, GetCrawlResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function getCrawl(controller: Controller, request: GetCrawlRequest): Promise<GetCrawlResponse> {
	return await controller.docsIndex.getCrawl(request.serverUrl, request.project, request.crawlId)
}
