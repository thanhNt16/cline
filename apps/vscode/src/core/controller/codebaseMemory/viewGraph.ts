import { EmptyRequest } from "@shared/proto/cline/common"
import { ViewGraphResponse } from "@shared/proto/cline/codebase_memory"
import * as vscode from "vscode"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../index"

export async function viewGraph(controller: Controller, _request: EmptyRequest): Promise<ViewGraphResponse> {
	try {
		const url = await controller.codebaseMemory.viewGraph()
		await vscode.env.openExternal(vscode.Uri.parse(url))
		return ViewGraphResponse.create({ url })
	} catch (error) {
		Logger.error("Failed to start graph server:", error)
		throw error
	}
}
