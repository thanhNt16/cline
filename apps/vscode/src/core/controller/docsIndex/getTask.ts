import { TaskStatusRequest, TaskStatusResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function getTask(controller: Controller, request: TaskStatusRequest): Promise<TaskStatusResponse> {
	return await controller.docsIndex.getTask(request.serverUrl, request.taskId)
}
