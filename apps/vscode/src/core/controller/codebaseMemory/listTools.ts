import { EmptyRequest } from "@shared/proto/cline/common"
import { CodebaseMemoryTools } from "@shared/proto/cline/codebase_memory"
import type { Controller } from "../index"

export async function listTools(controller: Controller, _request: EmptyRequest): Promise<CodebaseMemoryTools> {
	const tools = controller.codebaseMemory.listTools()
	return CodebaseMemoryTools.create({ tools })
}
