import { describe, expect, mock, test } from "bun:test"

let mockRequestResult: any = {
	content: [{ type: "text", text: "" }],
}

mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: class MockClient {
		connect = mock(async () => {})
		request = mock(async (_req: any) => mockRequestResult)
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
		mockRequestResult = {
			content: [{ type: "text", text: JSON.stringify({ projects: [{ name: "test", mount_path: "/data", total_chunks: 5, status: "indexed" }] }) }],
		}
		const client = new VesselIndexerClient("http://localhost:20130")
		await client.connect()
		const result = await client.callTool("list_projects", {})
		expect(result.projects).toBeDefined()
		expect(result.projects[0].name).toBe("test")
		await client.close()
	})

	test("callTool returns raw text if not JSON", async () => {
		mockRequestResult = {
			content: [{ type: "text", text: "plain text response" }],
		}
		const client = new VesselIndexerClient("http://localhost:20130")
		await client.connect()
		const result = await client.callTool("some_tool", {})
		expect(result).toBe("plain text response")
		await client.close()
	})
})
