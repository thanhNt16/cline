import { ListDocumentsRequest, ListDocumentsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function listDocuments(controller: Controller, request: ListDocumentsRequest): Promise<ListDocumentsResponse> {
	return await controller.docsIndex.listDocuments(request.serverUrl, request.project)
}
