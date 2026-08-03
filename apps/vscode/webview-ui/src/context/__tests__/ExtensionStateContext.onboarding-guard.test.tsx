import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ExtensionStateContextProvider, useExtensionState } from "../ExtensionStateContext"

// Harness for the onboarding guard: the provider's state subscription callback
// is captured on mount, then driven with a message whose `stateJson` omits
// `welcomeViewCompleted`. `showWelcome` must stay false — only an explicit
// `welcomeViewCompleted === false` may flip the app to onboarding.

const mocks = vi.hoisted(() => {
	const subscribeToState = vi.fn()
	const stateCallbacks = { onResponse: null as null | ((resp: any) => void) }
	subscribeToState.mockImplementation((_req: unknown, callbacks: any) => {
		stateCallbacks.onResponse = callbacks.onResponse
		return vi.fn()
	})
	const noopSubscribe = vi.fn().mockReturnValue(vi.fn())
	const noopCall = vi.fn().mockResolvedValue(undefined)
	return {
		subscribeToState,
		stateCallbacks,
		noopSubscribe,
		noopCall,
	}
})

vi.mock("@/services/grpc-client", () => ({
	StateServiceClient: {
		subscribeToState: mocks.subscribeToState,
		getAvailableTerminalProfiles: mocks.noopCall,
	},
	McpServiceClient: {
		subscribeToMcpServers: mocks.noopSubscribe,
	},
	UiServiceClient: {
		initializeWebview: mocks.noopCall,
		subscribeToAccountButtonClicked: mocks.noopSubscribe,
		subscribeToChatButtonClicked: mocks.noopSubscribe,
		subscribeToHistoryButtonClicked: mocks.noopSubscribe,
		subscribeToMarketplaceButtonClicked: mocks.noopSubscribe,
		subscribeToMcpButtonClicked: mocks.noopSubscribe,
		subscribeToPartialMessage: mocks.noopSubscribe,
		subscribeToRelinquishControl: mocks.noopSubscribe,
		subscribeToSettingsButtonClicked: mocks.noopSubscribe,
		subscribeToWorktreesButtonClicked: mocks.noopSubscribe,
	},
	ModelsServiceClient: {
		refreshOpenRouterModelsRpc: mocks.noopCall,
		refreshVercelAiGatewayModelsRpc: mocks.noopCall,
		refreshGroqModelsRpc: mocks.noopCall,
		refreshHicapModels: mocks.noopCall,
		refreshBasetenModelsRpc: mocks.noopCall,
		refreshLiteLlmModelsRpc: mocks.noopCall,
		subscribeToOpenRouterModels: mocks.noopSubscribe,
		subscribeToLiteLlmModels: mocks.noopSubscribe,
	},
}))

function Probe() {
	const { showWelcome } = useExtensionState()
	return <div data-testid="showWelcome">{String(showWelcome)}</div>
}

describe("ExtensionStateContext onboarding guard", () => {
	beforeEach(() => {
		mocks.subscribeToState.mockClear()
		mocks.stateCallbacks.onResponse = null
		mocks.noopCall.mockResolvedValue(undefined)
	})

	it("does not set showWelcome when welcomeViewCompleted is missing from state", async () => {
		render(
			<ExtensionStateContextProvider>
				<Probe />
			</ExtensionStateContextProvider>,
		)
		expect(mocks.stateCallbacks.onResponse).toBeTruthy()

		act(() => {
			mocks.stateCallbacks.onResponse!({
				stateJson: JSON.stringify({ apiConfiguration: {}, mcpDisplayMode: "grid", platform: "vscode" }),
			})
		})
		expect(screen.getByTestId("showWelcome").textContent).toBe("false")
	})

	it("shows onboarding only on an explicit welcomeViewCompleted false", async () => {
		render(
			<ExtensionStateContextProvider>
				<Probe />
			</ExtensionStateContextProvider>,
		)
		expect(mocks.stateCallbacks.onResponse).toBeTruthy()

		act(() => {
			mocks.stateCallbacks.onResponse!({
				stateJson: JSON.stringify({ welcomeViewCompleted: false }),
			})
		})
		expect(screen.getByTestId("showWelcome").textContent).toBe("true")
	})
})
