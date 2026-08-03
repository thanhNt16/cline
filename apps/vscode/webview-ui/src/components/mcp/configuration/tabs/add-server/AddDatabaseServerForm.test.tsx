import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AddDatabaseServerForm from "./AddDatabaseServerForm"

const mocks = vi.hoisted(() => ({
	addStdioMcpServer: vi.fn(),
	deleteMcpServer: vi.fn(),
	setMcpServers: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({
	McpServiceClient: {
		addStdioMcpServer: mocks.addStdioMcpServer,
		deleteMcpServer: mocks.deleteMcpServer,
	},
}))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		setMcpServers: mocks.setMcpServers,
	}),
}))

vi.mock("@shared/proto-conversions/mcp/mcp-server-conversion", () => ({
	convertProtoMcpServersToMcpServers: () => [],
}))

describe("AddDatabaseServerForm", () => {
	beforeEach(() => {
		mocks.addStdioMcpServer.mockReset()
		mocks.deleteMcpServer.mockReset()
		mocks.setMcpServers.mockReset()
		mocks.addStdioMcpServer.mockResolvedValue({ mcpServers: undefined })
		mocks.deleteMcpServer.mockResolvedValue(undefined)
	})

	it("submits the prebuilt postgres stdio config with required fields", async () => {
		const user = userEvent.setup()
		const onDone = vi.fn()
		render(<AddDatabaseServerForm onDone={onDone} />)

		await user.clear(screen.getByLabelText("Server Name"))
		await user.type(screen.getByLabelText("Server Name"), "toolbox-postgres")
		await user.type(screen.getByLabelText("Database"), "appdb")
		await user.type(screen.getByLabelText("User"), "appuser")
		await user.type(screen.getByLabelText("Password"), "secret")
		await user.click(screen.getByRole("button", { name: "Add Server" }))

		await waitFor(() => expect(mocks.addStdioMcpServer).toHaveBeenCalledTimes(1))
		expect(mocks.addStdioMcpServer).toHaveBeenCalledWith(
			expect.objectContaining({
				serverName: "toolbox-postgres",
				command: "npx",
				args: ["-y", "@toolbox-sdk/server", "--prebuilt=postgres", "--stdio"],
				env: expect.objectContaining({
					POSTGRES_HOST: "127.0.0.1",
					POSTGRES_PORT: "5432",
					POSTGRES_DATABASE: "appdb",
					POSTGRES_USER: "appuser",
					POSTGRES_PASSWORD: "secret",
				}),
				cellockaiPreset: "postgres-mcp-toolbox",
			}),
		)
		expect(onDone).toHaveBeenCalled()
	})

	it("blocks submit when a required field is empty", async () => {
		const user = userEvent.setup()
		render(<AddDatabaseServerForm onDone={vi.fn()} />)

		await user.type(screen.getByLabelText("Database"), "appdb")
		await user.click(screen.getByRole("button", { name: "Add Server" }))

		expect(mocks.addStdioMcpServer).not.toHaveBeenCalled()
		expect(screen.getByText(/required/i)).toBeInTheDocument()
	})

	it("renders initial values and saves changes in edit mode", async () => {
		const user = userEvent.setup()
		render(
			<AddDatabaseServerForm
				onDone={vi.fn()}
				initialName="pg-existing"
				initialFields={{ name: "pg-existing", database: "db", user: "u", password: "p" }}
			/>,
		)

		expect(screen.getByDisplayValue("pg-existing")).toBeInTheDocument()
		expect(screen.getByDisplayValue("db")).toBeInTheDocument()
		await user.click(screen.getByRole("button", { name: "Save Changes" }))

		await waitFor(() => expect(mocks.addStdioMcpServer).toHaveBeenCalled())
		expect(mocks.addStdioMcpServer).toHaveBeenCalledWith(
			expect.objectContaining({ cellockaiPreset: "postgres-mcp-toolbox" }),
		)
	})
})
