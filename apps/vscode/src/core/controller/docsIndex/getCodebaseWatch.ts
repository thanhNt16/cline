import { CodebaseWatchStatus, GetCodebaseWatchRequest } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function getCodebaseWatch(controller: Controller, request: GetCodebaseWatchRequest): Promise<CodebaseWatchStatus> {
	return await controller.docsIndex.getCodebaseWatch(request.serverUrl, request.project)
}
