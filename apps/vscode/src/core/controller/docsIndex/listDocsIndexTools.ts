import { EmptyRequest } from "@shared/proto/cline/common"
import { DocsIndexTools } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function listDocsIndexTools(controller: Controller, _request: EmptyRequest): Promise<DocsIndexTools> {
	return controller.docsIndex.listDocsIndexTools()
}
