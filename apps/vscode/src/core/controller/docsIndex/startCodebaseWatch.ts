import { CodebaseWatchStatus, StartCodebaseWatchRequest } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function startCodebaseWatch(
	controller: Controller,
	request: StartCodebaseWatchRequest,
): Promise<CodebaseWatchStatus> {
	return await controller.docsIndex.startCodebaseWatch(request.serverUrl, request.project, request.path, request.debounceSecs)
}
