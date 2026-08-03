import { CodebaseToolCatalog, ListCodebaseToolsRequest } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function listCodebaseTools(controller: Controller, request: ListCodebaseToolsRequest): Promise<CodebaseToolCatalog> {
	return await controller.docsIndex.listCodebaseTools(request.serverUrl)
}
