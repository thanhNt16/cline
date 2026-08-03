import { IndexCodebaseRequest, IndexCodebaseResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function indexCodebase(controller: Controller, request: IndexCodebaseRequest): Promise<IndexCodebaseResponse> {
	return await controller.docsIndex.indexCodebase(request.serverUrl, request.project, request.path)
}
