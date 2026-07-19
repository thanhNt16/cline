import { CreateProjectRequest, CreateProjectResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function createProject(controller: Controller, request: CreateProjectRequest): Promise<CreateProjectResponse> {
	return await controller.docsIndex.createProject(request.serverUrl, request.name)
}
