import { ListCrawlsRequest, ListCrawlsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function listCrawls(controller: Controller, request: ListCrawlsRequest): Promise<ListCrawlsResponse> {
	return await controller.docsIndex.listCrawls(request.serverUrl, request.project)
}
