import { CodebaseWatchStatus, GetCodebaseWatchRequest } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function stopCodebaseWatch(controller: Controller, request: GetCodebaseWatchRequest): Promise<CodebaseWatchStatus> {
	return await controller.docsIndex.stopCodebaseWatch(request.serverUrl, request.project)
}
