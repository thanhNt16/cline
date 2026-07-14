import { SearchDocumentsRequest, SearchDocumentsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function searchDocuments(controller: Controller, request: SearchDocumentsRequest): Promise<SearchDocumentsResponse> {
	return await controller.docsIndex.searchDocuments(request.serverUrl, request.project, request.query, request.topK)
}
