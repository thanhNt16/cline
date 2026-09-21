import type { ClineMessage } from "@shared/ExtensionMessage"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ChatRow from "./ChatRow"

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		mcpServers: [],
		browserSettings: { viewport: { width: 900, height: 600 } },
		mode: "act",
		customModes: [],
		allowedCommands: [],
		deniedCommands: [],
		alwaysAllowMcp: false,
		clineMessages: [],
	}),
}))

vi.mock("@/services/grpc-client", () => ({
	FileServiceClient: {},
	UiServiceClient: {
		logToOutput: vi.fn().mockResolvedValue({}),
	},
}))

vi.mock("./DiffEditRow", () => ({
	DiffEditRow: () => <div data-testid="diff-edit-row">DiffEditRow</div>,
}))

describe("ChatRow resiliency with tool messages", () => {
	const defaultProps = {
		isExpanded: false,
		onToggleExpand: vi.fn(),
		isLast: true,
		onHeightChange: vi.fn(),
		onSetQuote: vi.fn(),
		sendMessageFromChatRow: vi.fn(),
	}

	it("renders without crashing when message.text contains invalid JSON for say: tool", () => {
		const message: ClineMessage = {
			ts: 100,
			type: "say",
			say: "tool",
			text: "{ this is invalid JSON that would previously crash RootErrorBoundary",
		}

		expect(() => {
			render(<ChatRow {...defaultProps} message={message} />)
		}).not.toThrow()
	})

	it("renders without crashing when message.text contains invalid JSON for say: use_mcp_server", () => {
		const message: ClineMessage = {
			ts: 101,
			type: "say",
			say: "use_mcp_server",
			text: "invalid mcp json payload",
		}

		expect(() => {
			render(<ChatRow {...defaultProps} message={message} />)
		}).not.toThrow()
	})

	it("renders without crashing when message.text contains invalid JSON for say: user_feedback_diff", () => {
		const message: ClineMessage = {
			ts: 102,
			type: "say",
			say: "user_feedback_diff",
			text: "invalid diff json payload",
		}

		expect(() => {
			render(<ChatRow {...defaultProps} message={message} />)
		}).not.toThrow()
	})

	it("renders without crashing when message.text contains invalid JSON for say: api_req_started", () => {
		const message: ClineMessage = {
			ts: 103,
			type: "say",
			say: "api_req_started",
			text: "not json at all",
		}

		expect(() => {
			render(<ChatRow {...defaultProps} message={message} />)
		}).not.toThrow()
	})
})
