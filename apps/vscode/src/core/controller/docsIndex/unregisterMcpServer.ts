import { Empty } from "@shared/proto/cline/common"
import { UnregisterMcpRequest } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function unregisterMcpServer(controller: Controller, _request: UnregisterMcpRequest): Promise<Empty> {
	await controller.docsIndex.unregisterMcpServer()
	return Empty.create()
}
