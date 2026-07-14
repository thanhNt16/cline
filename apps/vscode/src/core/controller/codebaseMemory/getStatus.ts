import { EmptyRequest } from "@shared/proto/cline/common"
import { CodebaseMemoryStatus } from "@shared/proto/cline/codebase_memory"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../index"

export async function getStatus(controller: Controller, _request: EmptyRequest): Promise<CodebaseMemoryStatus> {
	try {
		return await controller.codebaseMemory.getStatus()
	} catch (error) {
		Logger.error("Failed to get codebase-memory status:", error)
		return CodebaseMemoryStatus.create({
			binaryInstalled: false,
			isIndexed: false,
			graphServerRunning: false,
			mcpServerRegistered: false,
		})
	}
}
