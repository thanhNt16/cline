import { DeleteCrawlRequest, DeleteCrawlResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function deleteCrawl(controller: Controller, request: DeleteCrawlRequest): Promise<DeleteCrawlResponse> {
	return await controller.docsIndex.deleteCrawl(request.serverUrl, request.project, request.crawlId)
}
