import { describe, expect, mock, test } from "bun:test"

// Mock the MCP SDK modules before importing the class
mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: class MockClient {
		connect = mock(async () => {})
		request = mock(async (req: any) => ({
			content: [{ type: "text", text: JSON.stringify({ projects: [{ name: "test", mount_path: "/data", total_chunks: 5, status: "indexed" }] }) }],
		}))
		close = mock(async () => {})
	},
}))

mock.module("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport: class MockTransport {},
}))

mock.module("@modelcontextprotocol/sdk/types.js", () => ({
	CallToolResultSchema: {},
}))

const { VesselIndexerClient } = await import("../VesselIndexerClient")

describe("VesselIndexerClient", () => {
	test("callTool parses JSON text content from MCP response", async () => {
		const client = new VesselIndexerClient("http://localhost:20130")
		await client.connect()
		const result = await client.callTool("list_projects", {})
		expect(result.projects).toBeDefined()
		expect(result.projects[0].name).toBe("test")
		await client.close()
	})

	test("callTool returns raw text if not JSON", async () => {
		// Re-mock with non-JSON response
		mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
			Client: class MockClient2 {
				connect = mock(async () => {})
				request = mock(async () => ({
					content: [{ type: "text", text: "plain text response" }],
				}))
				close = mock(async () => {})
			},
		}))
		const { VesselIndexerClient: Client2 } = await import("../VesselIndexerClient")
		const client = new Client2("http://localhost:20130")
		await client.connect()
		const result = await client.callTool("some_tool", {})
		expect(result).toBe("plain text response")
		await client.close()
	})
})
