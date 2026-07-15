import { DeleteDocumentRequest, DeleteDocumentResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function deleteDocument(controller: Controller, request: DeleteDocumentRequest): Promise<DeleteDocumentResponse> {
	return await controller.docsIndex.deleteDocument(request.serverUrl, request.project, request.path)
}
