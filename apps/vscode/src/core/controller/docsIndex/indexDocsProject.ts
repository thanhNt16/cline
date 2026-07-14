import { DocsIndexProjectRequest, DocsIndexProjectResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function indexDocsProject(
	controller: Controller,
	request: DocsIndexProjectRequest,
): Promise<DocsIndexProjectResponse> {
	return await controller.docsIndex.indexDocsProject(request.serverUrl, request.project)
}
