import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EmptyRequest } from "@shared/proto/cline/common"

const mocks = vi.hoisted(() => ({
	getDocsIndexSettings: vi.fn(),
	updateDocsIndexSettings: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({
	DocsIndexServiceClient: {
		getDocsIndexSettings: mocks.getDocsIndexSettings,
		updateDocsIndexSettings: mocks.updateDocsIndexSettings,
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
// initialization from the persisted settings RPC. Other sections are stubbed.
vi.mock("./sections/DocsIndexSection", () => ({
	__esModule: true,
	default: (props: { serverUrl: string; selectedProject: string }) => (
		<div data-testid="docs">
			{props.serverUrl}|{props.selectedProject}
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
		vi.useRealTimers()
	})

	it("initializes serverUrl and selectedProject from persisted settings", async () => {
		mocks.getDocsIndexSettings.mockResolvedValue({ serverUrl: "http://persisted:9", lastSelectedProject: "myrepo" })
		render(<SettingsView onDone={() => {}} targetSection="docs-index" />)
		expect(mocks.getDocsIndexSettings).toHaveBeenCalledWith(EmptyRequest.create())
		await waitFor(() =>
			expect(screen.getByTestId("docs").textContent).toBe("http://persisted:9|myrepo"),
		)
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
