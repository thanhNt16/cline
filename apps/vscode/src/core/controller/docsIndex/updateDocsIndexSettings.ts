import { UpdateDocsIndexSettingsRequest, UpdateDocsIndexSettingsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function updateDocsIndexSettings(
	controller: Controller,
	request: UpdateDocsIndexSettingsRequest,
): Promise<UpdateDocsIndexSettingsResponse> {
	const { serverUrl, lastSelectedProject } = await controller.docsIndex.updateDocsIndexSettings(
		request.workspacePath,
		request.serverUrl,
		request.selectedProject,
	)
	return UpdateDocsIndexSettingsResponse.create({ serverUrl, lastSelectedProject })
}
