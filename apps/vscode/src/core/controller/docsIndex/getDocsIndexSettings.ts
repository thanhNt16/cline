import { EmptyRequest } from "@shared/proto/cline/common"
import { GetDocsIndexSettingsResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function getDocsIndexSettings(
	controller: Controller,
	_request: EmptyRequest,
): Promise<GetDocsIndexSettingsResponse> {
	const workspacePath = await controller.docsIndex.getWorkspacePath()
	const { serverUrl, lastSelectedProject } = await controller.docsIndex.getDocsIndexSettings(workspacePath)
	return GetDocsIndexSettingsResponse.create({ serverUrl, lastSelectedProject })
}
