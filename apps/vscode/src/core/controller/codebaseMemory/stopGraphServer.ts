import { Empty, EmptyRequest } from "@shared/proto/cline/common"
import type { Controller } from "../index"

export async function stopGraphServer(controller: Controller, _request: EmptyRequest): Promise<Empty> {
	controller.codebaseMemory.stopGraphServer()
	return Empty.create()
}
