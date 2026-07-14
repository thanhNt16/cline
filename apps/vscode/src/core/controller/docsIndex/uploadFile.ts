import { UploadFileRequest, UploadFileResponse } from "@shared/proto/cline/docs_index"
import type { Controller } from "../index"

export async function uploadFile(controller: Controller, request: UploadFileRequest): Promise<UploadFileResponse> {
	return await controller.docsIndex.uploadFile(request.serverUrl, request.project)
}
