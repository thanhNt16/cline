import type { AddStdioMcpServerRequest } from "@shared/proto/cline/mcp"
import { McpServers } from "@shared/proto/cline/mcp"
import { convertMcpServersToProtoMcpServers } from "@/shared/proto-conversions/mcp/mcp-server-conversion"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../index"

export async function addStdioMcpServer(controller: Controller, request: AddStdioMcpServerRequest): Promise<McpServers> {
	try {
		if (!request.serverName) {
			throw new Error("Server name is required")
		}
		if (!request.command) {
			throw new Error("Command is required")
		}

		const servers = await controller.mcpHub?.addStdioServer(
			request.serverName,
			request.command,
			request.args,
			request.env,
			request.cwd,
		)

		const protoServers = convertMcpServersToProtoMcpServers(servers)

		return McpServers.create({ mcpServers: protoServers })
	} catch (error) {
		Logger.error(`Failed to add stdio MCP server ${request.serverName}:`, error)

		throw error
	}
}
