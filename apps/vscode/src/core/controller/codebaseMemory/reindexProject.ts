import { EmptyRequest } from "@shared/proto/cline/common"
import { IndexProgressEvent, IndexProgressEvent_Level } from "@shared/proto/cline/codebase_memory"
import { Logger } from "@/shared/services/Logger"
import { getRequestRegistry, type StreamingResponseHandler } from "../grpc-handler"
import type { Controller } from "../index"

export async function reindexProject(
	controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<IndexProgressEvent>,
	requestId?: string,
): Promise<void> {
	const cleanup = () => {}

	if (requestId) {
		getRequestRegistry().registerRequest(requestId, cleanup, { type: "codebase_memory_reindex" }, responseStream)
	}

	try {
		await controller.codebaseMemory.reindexProject(async (event) => {
			await responseStream(event, false)
		})
		await responseStream(IndexProgressEvent.create({ level: IndexProgressEvent_Level.DONE, message: "" }), true)
	} catch (error) {
		Logger.error("Failed to reindex project:", error)
		await responseStream(
			IndexProgressEvent.create({
				level: IndexProgressEvent_Level.ERROR,
				message: `Failed: ${error instanceof Error ? error.message : String(error)}`,
			}),
			true,
		)
	}
}
