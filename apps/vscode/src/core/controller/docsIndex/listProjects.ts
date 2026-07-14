import { ListProjectsRequest, ListProjectsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function listProjects(controller: Controller, request: ListProjectsRequest): Promise<ListProjectsResponse> {
	return await controller.docsIndex.listProjects(request.serverUrl)
}
