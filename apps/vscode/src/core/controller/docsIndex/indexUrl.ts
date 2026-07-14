import { IndexUrlRequest, IndexUrlResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function indexUrl(controller: Controller, request: IndexUrlRequest): Promise<IndexUrlResponse> {
	return await controller.docsIndex.indexUrl(request.serverUrl, request.project, request.url, request.depth, request.maxPages)
}
