import { beforeEach, describe, expect, it, vi } from "vitest"
import { SdkInteractionCoordinator, type ToolApprovalRequest } from "../sdk-interaction-coordinator"
import { isEditTool } from "../sdk-tool-policies"

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function createMockMessages() {
	const emitted: unknown[] = []
	return {
		appendAndEmit: vi.fn((msgs, _status) => emitted.push(...msgs)),
		emitted,
	}
}

function createToolRequest(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
	return {
		agentId: "a",
		conversationId: "c",
		iteration: 1,
		toolCallId: "tc1",
		toolName: "editor",
		input: {},
		policy: {},
		...overrides,
	}
}

// ---------------------------------------------------------------------------
// isEditTool coverage
// ---------------------------------------------------------------------------

describe("isEditTool", () => {
	const editTools = ["editor", "replace_in_file", "write_to_file", "apply_patch", "delete_file"]
	it("returns true for all edit tool names", () => {
		for (const name of editTools) {
			expect(isEditTool(name)).toBe(true)
		}
	})

	it("returns false for non-edit tools", () => {
		expect(isEditTool("read_files")).toBe(false)
		expect(isEditTool("run_commands")).toBe(false)
		expect(isEditTool("fetch_web_content")).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// SdkInteractionCoordinator — ask-once edit approval
// ---------------------------------------------------------------------------

describe("SdkInteractionCoordinator ask-once edit approval", () => {
	let messages: ReturnType<typeof createMockMessages>
	let onEditToolApproved: ReturnType<typeof vi.fn>

	beforeEach(() => {
		messages = createMockMessages()
		onEditToolApproved = vi.fn()
	})

	function makeCoordinator(opts: Partial<ConstructorParameters<typeof SdkInteractionCoordinator>[0]> = {}) {
		return new SdkInteractionCoordinator({
			messages: messages as any,
			getSessionId: () => "s1",
			postStateToWebview: vi.fn(),
			onEditToolApproved: onEditToolApproved as () => void,
			...opts,
		})
	}

	it("first edit tool is NOT auto-approved (asks user)", async () => {
		// shouldAutoApproveTool not wired → defaults to false → prompt emitted
		const coord = makeCoordinator()
		const request = createToolRequest({ toolName: "editor" })

		const promise = coord.handleRequestToolApproval(request)
		// Should NOT resolve immediately — it's waiting for user response
		let resolved = false
		void promise.then(() => {
			resolved = true
		})
		await vi.waitFor(() => expect(messages.appendAndEmit).toHaveBeenCalled())
		expect(resolved).toBe(false)

		// Clean up: resolve the pending promise
		coord.resolvePendingToolApproval(undefined, "yesButtonClicked")
		await promise
	})

	it("after approving an edit tool, onEditToolApproved fires", async () => {
		const coord = makeCoordinator()
		const request = createToolRequest({ toolName: "replace_in_file" })

		const promise = coord.handleRequestToolApproval(request)
		await vi.waitFor(() => expect(messages.appendAndEmit).toHaveBeenCalled())

		coord.resolvePendingToolApproval(undefined, "yesButtonClicked")
		await promise

		expect(onEditToolApproved).toHaveBeenCalledOnce()
	})

	it("approving a non-edit tool does NOT fire onEditToolApproved", async () => {
		const coord = makeCoordinator()
		const request = createToolRequest({ toolName: "read_files" })

		const promise = coord.handleRequestToolApproval(request)
		await vi.waitFor(() => expect(messages.appendAndEmit).toHaveBeenCalled())

		coord.resolvePendingToolApproval(undefined, "yesButtonClicked")
		await promise

		expect(onEditToolApproved).not.toHaveBeenCalled()
	})

	it("rejecting an edit tool does NOT fire onEditToolApproved", async () => {
		const coord = makeCoordinator()
		const request = createToolRequest({ toolName: "write_to_file" })

		const promise = coord.handleRequestToolApproval(request)
		await vi.waitFor(() => expect(messages.appendAndEmit).toHaveBeenCalled())

		coord.resolvePendingToolApproval("nope", "noButtonClicked")
		await promise

		expect(onEditToolApproved).not.toHaveBeenCalled()
	})

	it("shouldAutoApproveTool returns true for edit tools after onEditToolApproved sets flag", async () => {
		// Simulate SdkController wiring: a flag that gets flipped by onEditToolApproved
		let editsAutoApprovedThisSession = false
		const coord = makeCoordinator({
			onEditToolApproved: () => {
				editsAutoApprovedThisSession = true
			},
			shouldAutoApproveTool: (request) => {
				if (isEditTool(request.toolName) && editsAutoApprovedThisSession) {
					return true
				}
				return false
			},
		})

		// First edit: not auto-approved (flag false)
		const req1 = createToolRequest({ toolName: "apply_patch" })
		const p1 = coord.handleRequestToolApproval(req1)
		await vi.waitFor(() => expect(messages.appendAndEmit).toHaveBeenCalled())
		expect(p1).resolves.toBeDefined() // still pending
		coord.resolvePendingToolApproval(undefined, "yesButtonClicked")
		await p1

		expect(editsAutoApprovedThisSession).toBe(true)

		// Second edit: auto-approved (flag true)
		const req2 = createToolRequest({ toolName: "delete_file", toolCallId: "tc2" })
		const result2 = await coord.handleRequestToolApproval(req2)
		expect(result2).toEqual({ approved: true })
		// No new ask message emitted for the second one
		expect(messages.appendAndEmit).toHaveBeenCalledTimes(1) // only first call's emit
	})

	it("non-edit tools are unaffected by the session flag", async () => {
		const editsAutoApprovedThisSession = true // pretend already set
		const coord = makeCoordinator({
			shouldAutoApproveTool: (request) => {
				if (isEditTool(request.toolName) && editsAutoApprovedThisSession) {
					return true
				}
				return false // non-edit tools still not auto-approved
			},
		})

		const req = createToolRequest({ toolName: "run_commands" })
		const promise = coord.handleRequestToolApproval(req)
		await vi.waitFor(() => expect(messages.appendAndEmit).toHaveBeenCalled())
		// Still pending — non-edit tool not auto-approved by session flag alone
		let resolved = false
		void promise.then(() => {
			resolved = true
		})
		expect(resolved).toBe(false)
		coord.resolvePendingToolApproval(undefined, "yesButtonClicked")
		await promise
	})
})
