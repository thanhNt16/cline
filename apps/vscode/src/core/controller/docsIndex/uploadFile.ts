import { UploadFileRequest, UploadFileResponse } from "@shared/proto/cline/docs_index"
import { selectFiles } from "@integrations/misc/process-files"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../index"

export async function uploadFile(controller: Controller, request: UploadFileRequest): Promise<UploadFileResponse> {
	let files: string[]
	try {
		const result = await selectFiles(false)
		files = result.files
	} catch (error) {
		Logger.error("[DocsIndex] Failed to open file dialog:", error)
		return UploadFileResponse.create({ project: request.project, filename: "", path: "", size: 0, status: "cancelled" })
	}
	if (files.length === 0) {
		return UploadFileResponse.create({ project: request.project, filename: "", path: "", size: 0, status: "cancelled" })
	}
	return await controller.docsIndex.uploadFile(request.serverUrl, request.project, files[0])
}
