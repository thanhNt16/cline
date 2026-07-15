import { PollIndexJobRequest, PollIndexJobResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function pollIndexJob(controller: Controller, request: PollIndexJobRequest): Promise<PollIndexJobResponse> {
	return await controller.docsIndex.pollIndexJob(request.serverUrl, request.project, request.jobId)
}
