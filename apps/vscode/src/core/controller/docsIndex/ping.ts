import { PingRequest } from "@shared/proto/cline/docs_index"
import { PingResponse } from "@shared/proto/cline/docs_index"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../index"

export async function ping(controller: Controller, request: PingRequest): Promise<PingResponse> {
	try {
		return await controller.docsIndex.ping(request.serverUrl)
	} catch (error) {
		Logger.error("Failed to ping docs-index:", error)
		return PingResponse.create({ connected: false, serverVersion: "" })
	}
}
