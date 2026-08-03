import { DeleteProjectRequest, ProjectMutationResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function deleteProject(controller: Controller, request: DeleteProjectRequest): Promise<ProjectMutationResponse> {
	return await controller.docsIndex.deleteProject(request.serverUrl, request.project)
}
