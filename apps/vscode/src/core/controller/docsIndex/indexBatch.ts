import { IndexBatchRequest, IndexBatchResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function indexBatch(controller: Controller, request: IndexBatchRequest): Promise<IndexBatchResponse> {
	return await controller.docsIndex.indexBatch(request.serverUrl, request.project)
}
