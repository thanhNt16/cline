import { beforeEach, describe, expect, it, vi } from "vitest"
import { UiServiceClient } from "@/services/grpc-client"
import { reportWebviewError } from "./reportWebviewError"

vi.mock("@/services/grpc-client", () => ({ UiServiceClient: { logToOutput: vi.fn() } }))

const logToOutput = vi.mocked(UiServiceClient.logToOutput)

describe("reportWebviewError", () => {
	beforeEach(() => {
		logToOutput.mockReset()
		logToOutput.mockResolvedValue({})
	})

	it("sends source, message, stack and component stack", () => {
		const error = new Error("boom")
		error.stack = "Error: boom\n    at somewhere"
		reportWebviewError("RootErrorBoundary", error, "\n    in App")

		const sent = logToOutput.mock.calls[0][0].value
		expect(sent).toContain("[webview:RootErrorBoundary] boom")
		expect(sent).toContain("Stack: Error: boom")
		expect(sent).toContain("Component stack: \n    in App")
	})

	it("omits absent stack sections", () => {
		reportWebviewError("async", "plain string failure")
		expect(logToOutput.mock.calls[0][0].value).toBe("[webview:async] plain string failure")
	})

	it("never throws when the RPC rejects synchronously", () => {
		logToOutput.mockImplementation(() => {
			throw new Error("transport gone")
		})
		expect(() => reportWebviewError("async", new Error("boom"))).not.toThrow()
	})

	it("never throws when the RPC promise rejects", async () => {
		logToOutput.mockRejectedValue(new Error("host unreachable"))
		expect(() => reportWebviewError("async", new Error("boom"))).not.toThrow()
		await Promise.resolve()
	})
})
