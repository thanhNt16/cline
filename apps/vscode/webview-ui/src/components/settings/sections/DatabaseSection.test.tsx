import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import DatabaseSection from "./DatabaseSection"

const stateMocks = vi.hoisted(() => ({ mcpServers: [] as any[], navigateToMcp: vi.fn() }))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({ mcpServers: stateMocks.mcpServers, navigateToMcp: stateMocks.navigateToMcp }),
}))

vi.mock("@/services/grpc-client", () => ({
	McpServiceClient: { deleteMcpServer: vi.fn() },
}))

describe("DatabaseSection list", () => {
	beforeEach(() => {
		stateMocks.mcpServers = [
			{
				name: "pg1",
				config: JSON.stringify({
					command: "npx",
					args: [],
					env: {
						POSTGRES_DATABASE: "db1",
						POSTGRES_USER: "u1",
						POSTGRES_PASSWORD: "p",
						POSTGRES_HOST: "127.0.0.1",
						POSTGRES_PORT: "5432",
					},
					metadata: { cellockaiPreset: "postgres-mcp-toolbox" },
				}),
			},
			{ name: "other", config: JSON.stringify({ command: "node", args: [], env: {} }) },
		]
	})

	it("lists only postgres preset servers", () => {
		render(<DatabaseSection renderSectionHeader={() => null} />)
		expect(screen.getByText("pg1")).toBeInTheDocument()
		expect(screen.queryByText("other")).not.toBeInTheDocument()
		expect(screen.getByText(/Add New/i)).toBeInTheDocument()
	})
})
