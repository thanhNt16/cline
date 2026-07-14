import { ProjectStatsRequest, ProjectStatsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function projectStats(controller: Controller, request: ProjectStatsRequest): Promise<ProjectStatsResponse> {
	return await controller.docsIndex.projectStats(request.serverUrl, request.project)
}
