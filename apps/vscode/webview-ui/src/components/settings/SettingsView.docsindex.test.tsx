import { EmptyRequest } from "@shared/proto/cline/common"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	getDocsIndexSettings: vi.fn(),
	updateDocsIndexSettings: vi.fn(),
	ping: vi.fn(),
	registerMcpServer: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({
	DocsIndexServiceClient: {
		getDocsIndexSettings: mocks.getDocsIndexSettings,
		updateDocsIndexSettings: mocks.updateDocsIndexSettings,
		ping: mocks.ping,
		registerMcpServer: mocks.registerMcpServer,
	},
	StateServiceClient: {},
}))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		version: "1",
		environment: { osName: "darwin" },
		settingsInitialModelTab: "plan",
		workspaceRoots: [{ path: "/dev/myrepo" }],
		primaryRootIndex: 0,
	}),
}))

vi.mock("@/context/ClineAuthContext", () => ({
	useClineAuth: () => ({ activeOrganization: null, clineUser: null }),
}))
vi.mock("@/shared/internal/account", () => ({ isClineInternalTester: () => false }))

// DocsIndexSection surfaces the props SettingsView threads so we can assert
// initialization from the persisted settings RPC and connected state.
vi.mock("./sections/DocsIndexSection", () => ({
	__esModule: true,
	default: (props: { serverUrl: string; selectedProject: string; connected: boolean }) => (
		<div data-testid="docs">
			{props.serverUrl}|{props.selectedProject}|{props.connected ? 1 : 0}
		</div>
	),
}))
vi.mock("./sections/ApiConfigurationSection", () => ({ __esModule: true, default: () => null }))
vi.mock("./sections/FeatureSettingsSection", () => ({ __esModule: true, default: () => null }))
vi.mock("./sections/TerminalSettingsSection", () => ({ __esModule: true, default: () => null }))
vi.mock("./sections/GeneralSettingsSection", () => ({ __esModule: true, default: () => null }))
vi.mock("./sections/ProjectConfigSection", () => ({ ProjectConfigSection: () => null }))
vi.mock("./sections/RemoteConfigSection", () => ({ RemoteConfigSection: () => null }))
vi.mock("./sections/CodebaseMemorySection", () => ({ __esModule: true, default: () => null }))
vi.mock("./sections/DatabaseSection", () => ({ __esModule: true, default: () => null }))
vi.mock("./sections/DebugSection", () => ({ __esModule: true, default: () => null }))

import SettingsView from "./SettingsView"

describe("SettingsView docs-index init from global settings", () => {
	beforeEach(() => {
		mocks.getDocsIndexSettings.mockReset()
		mocks.updateDocsIndexSettings.mockReset()
		mocks.updateDocsIndexSettings.mockResolvedValue({})
		mocks.ping.mockReset()
		mocks.registerMcpServer.mockReset()
		// Default: auto-connect no-ops in tests that don't care
		mocks.ping.mockResolvedValue({ connected: false })
		vi.useRealTimers()
	})

	it("initializes serverUrl and selectedProject from persisted settings", async () => {
		mocks.getDocsIndexSettings.mockResolvedValue({ serverUrl: "http://persisted:9", lastSelectedProject: "myrepo" })
		render(<SettingsView onDone={() => {}} targetSection="docs-index" />)
		expect(mocks.getDocsIndexSettings).toHaveBeenCalledWith(EmptyRequest.create())
		await waitFor(() => expect(screen.getByTestId("docs").textContent).toBe("http://persisted:9|myrepo|0"))
	})

	it("does not persist the server URL before the initial read resolves", () => {
		vi.useFakeTimers()
		try {
			// Never resolves -> docsSettingsLoaded stays false -> persist effect is gated out.
			mocks.getDocsIndexSettings.mockReturnValue(new Promise(() => {}))
			render(<SettingsView onDone={() => {}} targetSection="docs-index" />)
			// Advance past the persist debounce; no write should occur pre-load.
			vi.advanceTimersByTime(1000)
			expect(mocks.updateDocsIndexSettings).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("SettingsView docs-index auto-connect", () => {
	beforeEach(() => {
		mocks.getDocsIndexSettings.mockReset()
		mocks.updateDocsIndexSettings.mockReset()
		mocks.updateDocsIndexSettings.mockResolvedValue({})
		mocks.ping.mockReset()
		mocks.registerMcpServer.mockReset()
		vi.useRealTimers()
	})

	it("auto-connects on load when a serverUrl is persisted and ping succeeds", async () => {
		mocks.getDocsIndexSettings.mockResolvedValue({ serverUrl: "http://localhost:8080", lastSelectedProject: "" })
		mocks.ping.mockResolvedValue({ connected: true })
		mocks.registerMcpServer.mockResolvedValue({})

		render(<SettingsView onDone={() => {}} targetSection="docs-index" />)

		await waitFor(() => {
			expect(mocks.ping).toHaveBeenCalledWith(expect.objectContaining({ serverUrl: "http://localhost:8080" }))
		})
		await waitFor(() => {
			expect(mocks.registerMcpServer).toHaveBeenCalledWith(expect.objectContaining({ serverUrl: "http://localhost:8080" }))
		})
		await waitFor(() => {
			expect(screen.getByTestId("docs").textContent).toBe("http://localhost:8080||1")
		})
	})

	it("does NOT auto-connect when ping fails", async () => {
		mocks.getDocsIndexSettings.mockResolvedValue({ serverUrl: "http://localhost:8080", lastSelectedProject: "" })
		mocks.ping.mockResolvedValue({ connected: false })

		render(<SettingsView onDone={() => {}} targetSection="docs-index" />)

		await waitFor(() => {
			expect(mocks.ping).toHaveBeenCalledTimes(1)
		})
		await waitFor(() => {
			expect(screen.getByTestId("docs").textContent).toBe("http://localhost:8080||0")
		})
		expect(mocks.registerMcpServer).not.toHaveBeenCalled()
	})

	it("does NOT auto-connect when no serverUrl", async () => {
		mocks.getDocsIndexSettings.mockResolvedValue({ serverUrl: "", lastSelectedProject: "" })

		render(<SettingsView onDone={() => {}} targetSection="docs-index" />)

		// Wait for settings load
		await waitFor(() => {
			expect(mocks.getDocsIndexSettings).toHaveBeenCalled()
		})
		expect(mocks.ping).not.toHaveBeenCalled()
		expect(mocks.registerMcpServer).not.toHaveBeenCalled()
	})

	it("auto-connect runs only once", async () => {
		mocks.getDocsIndexSettings.mockResolvedValue({ serverUrl: "http://localhost:8080", lastSelectedProject: "" })
		mocks.ping.mockResolvedValue({ connected: true })
		mocks.registerMcpServer.mockResolvedValue({})

		render(<SettingsView onDone={() => {}} targetSection="docs-index" />)

		await waitFor(() => {
			expect(screen.getByTestId("docs").textContent).toBe("http://localhost:8080||1")
		})

		// Give React a chance to re-render if it were going to fire again
		await new Promise((r) => setTimeout(r, 50))

		expect(mocks.ping).toHaveBeenCalledTimes(1)
		expect(mocks.registerMcpServer).toHaveBeenCalledTimes(1)
	})
})
