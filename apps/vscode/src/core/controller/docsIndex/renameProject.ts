import { ProjectMutationResponse, RenameProjectRequest } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function renameProject(controller: Controller, request: RenameProjectRequest): Promise<ProjectMutationResponse> {
	return await controller.docsIndex.renameProject(request.serverUrl, request.project, request.newName)
}
