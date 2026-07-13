import { useState } from "react"
import { AddStdioMcpServerRequest, McpServers } from "@shared/proto/cline/mcp"
import { McpServiceClient } from "@/services/grpc-client"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { convertProtoMcpServersToMcpServers } from "@/shared/proto-conversions/mcp/mcp-server-conversion"

interface EnvEntry {
	key: string
	value: string
}

export const AddStdioServerForm = ({ onDone }: { onDone: () => void }) => {
	const { setMcpServers } = useExtensionState()
	const [serverName, setServerName] = useState("")
	const [command, setCommand] = useState("")
	const [args, setArgs] = useState("")
	const [envEntries, setEnvEntries] = useState<EnvEntry[]>([{ key: "", value: "" }])
	const [cwd, setCwd] = useState("")
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(false)

	const handleAddEnvEntry = () => {
		setEnvEntries([...envEntries, { key: "", value: "" }])
	}

	const handleRemoveEnvEntry = (index: number) => {
		setEnvEntries(envEntries.filter((_, i) => i !== index))
	}

	const handleEnvEntryChange = (index: number, field: "key" | "value", value: string) => {
		const updated = [...envEntries]
		updated[index][field] = value
		setEnvEntries(updated)
	}

	const handleSubmit = async () => {
		setError("")
		if (!serverName.trim()) {
			setError("Server name is required")
			return
		}
		if (!command.trim()) {
			setError("Command is required")
			return
		}

		const env: Record<string, string> = {}
		for (const entry of envEntries) {
			if (entry.key.trim()) {
				env[entry.key.trim()] = entry.value
			}
		}

		setLoading(true)
		try {
			const response: McpServers = await McpServiceClient.addStdioMcpServer(
				AddStdioMcpServerRequest.create({
					serverName: serverName.trim(),
					command: command.trim(),
					args: args.trim() ? args.trim().split(/\s+/) : [],
					env,
					cwd: cwd.trim() || undefined,
				}),
			)
			if (response.mcpServers) {
				setMcpServers(convertProtoMcpServersToMcpServers(response.mcpServers))
			}
			onDone()
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="flex flex-col gap-3 p-4">
			<h3 className="text-vscode-fontSize font-bold">Add Local MCP Server (stdio)</h3>
			<p className="text-vscode-descriptionForeground text-sm">
				Configure a local MCP server that runs as a subprocess. The configuration is saved to
				<code className="mx-1 px-1 py-0.5 rounded bg-vscode-editor-background">.cellockai/mcp_settings.json</code>
				in your workspace.
			</p>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium">Server Name</label>
				<input
					type="text"
					value={serverName}
					onChange={(e) => setServerName(e.target.value)}
					placeholder="my-mcp-server"
					className="px-2 py-1 rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border"
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium">Command</label>
				<input
					type="text"
					value={command}
					onChange={(e) => setCommand(e.target.value)}
					placeholder="npx, uvx, node, etc."
					className="px-2 py-1 rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border"
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium">Arguments (space-separated)</label>
				<input
					type="text"
					value={args}
					onChange={(e) => setArgs(e.target.value)}
					placeholder="-y @modelcontextprotocol/server-filesystem /path"
					className="px-2 py-1 rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border"
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium">Environment Variables</label>
				{envEntries.map((entry, index) => (
					<div key={index} className="flex gap-2 items-center">
						<input
							type="text"
							value={entry.key}
							onChange={(e) => handleEnvEntryChange(index, "key", e.target.value)}
							placeholder="VAR_NAME"
							className="flex-1 px-2 py-1 rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border"
						/>
						<input
							type="text"
							value={entry.value}
							onChange={(e) => handleEnvEntryChange(index, "value", e.target.value)}
							placeholder="value"
							className="flex-1 px-2 py-1 rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border"
						/>
						<button
							type="button"
							onClick={() => handleRemoveEnvEntry(index)}
							className="px-2 py-1 text-vscode-descriptionForeground hover:text-vscode-errorForeground"
						>
							✕
						</button>
					</div>
				))}
				<button
					type="button"
					onClick={handleAddEnvEntry}
					className="text-sm text-vscode-textLink hover:underline self-start"
				>
					+ Add env variable
				</button>
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium">Working Directory (optional)</label>
				<input
					type="text"
					value={cwd}
					onChange={(e) => setCwd(e.target.value)}
					placeholder="/path/to/working/dir"
					className="px-2 py-1 rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border"
				/>
			</div>

			{error && (
				<div className="text-vscode-errorForeground text-sm p-2 rounded bg-vscode-input-background">
					{error}
				</div>
			)}

			<div className="flex gap-2">
				<button
					type="button"
					onClick={handleSubmit}
					disabled={loading}
					className="px-4 py-1.5 rounded bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground disabled:opacity-50"
				>
					{loading ? "Adding..." : "Add Server"}
				</button>
				<button
					type="button"
					onClick={onDone}
					className="px-4 py-1.5 rounded bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground hover:bg-vscode-button-secondaryHoverBackground"
				>
					Cancel
				</button>
			</div>
		</div>
	)
}
