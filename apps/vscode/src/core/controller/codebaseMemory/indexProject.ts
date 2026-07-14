import { IndexProgressEvent, IndexProgressEvent_Level } from "@shared/proto/cline/codebase_memory"
import type { IndexProjectRequest } from "@shared/proto/cline/codebase_memory"
import { Logger } from "@/shared/services/Logger"
import { getRequestRegistry, type StreamingResponseHandler } from "../grpc-handler"
import type { Controller } from "../index"

export async function indexProject(
	controller: Controller,
	request: IndexProjectRequest,
	responseStream: StreamingResponseHandler<IndexProgressEvent>,
	requestId?: string,
): Promise<void> {
	const cleanup = () => {
		// Indexing will end naturally; nothing specific to clean up here
	}

	if (requestId) {
		getRequestRegistry().registerRequest(requestId, cleanup, { type: "codebase_memory_index" }, responseStream)
	}

	try {
		await controller.codebaseMemory.indexProject(request.repoPath, async (event) => {
			await responseStream(event, false)
		})
		// Send a terminal empty message to close the stream
		await responseStream(IndexProgressEvent.create({ level: IndexProgressEvent_Level.DONE, message: "" }), true)
	} catch (error) {
		Logger.error("Failed to index project:", error)
		await responseStream(
			IndexProgressEvent.create({
				level: IndexProgressEvent_Level.ERROR,
				message: `Failed: ${error instanceof Error ? error.message : String(error)}`,
			}),
			true,
		)
	}
}
