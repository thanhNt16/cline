import { Empty } from "@shared/proto/cline/common"
import { RegisterMcpRequest } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function registerMcpServer(controller: Controller, request: RegisterMcpRequest): Promise<Empty> {
	await controller.docsIndex.registerMcpServer(request.serverUrl)
	return Empty.create()
}
