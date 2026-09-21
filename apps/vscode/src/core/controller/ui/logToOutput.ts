import type { StringRequest } from "@shared/proto/cline/common"
import { Empty } from "@shared/proto/cline/common"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../index"

/**
 * Forwards a webview crash report to the host output channel.
 * Webview errors otherwise only reach the webview devtools console, which nobody has open.
 * @param controller The controller instance
 * @param request The pre-formatted crash report
 * @returns Empty response
 */
export async function logToOutput(_controller: Controller, request: StringRequest): Promise<Empty> {
	Logger.error(request.value)
	return Empty.create({})
}
