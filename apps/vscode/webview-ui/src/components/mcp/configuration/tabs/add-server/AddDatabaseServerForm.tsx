import { AddStdioMcpServerRequest, McpServers } from "@shared/proto/cline/mcp"
import { convertProtoMcpServersToMcpServers } from "@shared/proto-conversions/mcp/mcp-server-conversion"
import { useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { McpServiceClient } from "@/services/grpc-client"
import { buildPostgresConfig } from "./databasePresets"

const inputClass = "px-2 py-1 rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border"

export const AddDatabaseServerForm = ({ onDone }: { onDone: () => void }) => {
	const { setMcpServers } = useExtensionState()
	const [name, setName] = useState("")
	const [host, setHost] = useState("")
	const [port, setPort] = useState("")
	const [database, setDatabase] = useState("")
	const [user, setUser] = useState("")
	const [password, setPassword] = useState("")
	const [queryParams, setQueryParams] = useState("")
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(false)

	const handleSubmit = async () => {
		setError("")
		if (!name.trim() || !database.trim() || !user.trim() || !password.trim()) {
			setError("Server name, database, user, and password are required")
			return
		}

		const cfg = buildPostgresConfig({
			name: name.trim(),
			host,
			port,
			database: database.trim(),
			user: user.trim(),
			password,
			queryParams,
		})

		setLoading(true)
		try {
			const response: McpServers = await McpServiceClient.addStdioMcpServer(
				AddStdioMcpServerRequest.create({
					serverName: cfg.serverName,
					command: cfg.command,
					args: cfg.args,
					env: cfg.env,
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
			<h3 className="text-vscode-fontSize font-bold">Connect Database (PostgreSQL)</h3>
			<p className="text-vscode-descriptionForeground text-sm">
				Connects the agent to a PostgreSQL database via{" "}
				<a
					className="text-vscode-textLink hover:underline"
					href="https://github.com/googleapis/mcp-toolbox"
					rel="noreferrer"
					target="_blank">
					mcp-toolbox
				</a>{" "}
				prebuilt tools (<code>list_tables</code>, <code>execute_sql</code>, …). Requires <code>Node.js</code>/
				<code>npx</code>. Saved to{" "}
				<code className="mx-1 px-1 py-0.5 rounded bg-vscode-editor-background">.cellockai/mcp_settings.json</code>.
			</p>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium" htmlFor="db-name">
					Server Name
				</label>
				<input className={inputClass} id="db-name" onChange={(e) => setName(e.target.value)} type="text" value={name} />
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium" htmlFor="db-host">
					Host <span className="text-vscode-descriptionForeground">(optional, default 127.0.0.1)</span>
				</label>
				<input
					className={inputClass}
					id="db-host"
					onChange={(e) => setHost(e.target.value)}
					placeholder="127.0.0.1"
					type="text"
					value={host}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium" htmlFor="db-port">
					Port <span className="text-vscode-descriptionForeground">(optional, default 5432)</span>
				</label>
				<input
					className={inputClass}
					id="db-port"
					onChange={(e) => setPort(e.target.value)}
					placeholder="5432"
					type="text"
					value={port}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium" htmlFor="db-database">
					Database
				</label>
				<input
					className={inputClass}
					id="db-database"
					onChange={(e) => setDatabase(e.target.value)}
					type="text"
					value={database}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium" htmlFor="db-user">
					User
				</label>
				<input className={inputClass} id="db-user" onChange={(e) => setUser(e.target.value)} type="text" value={user} />
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium" htmlFor="db-password">
					Password
				</label>
				<input
					className={inputClass}
					id="db-password"
					onChange={(e) => setPassword(e.target.value)}
					type="password"
					value={password}
				/>
			</div>

			<details className="text-sm">
				<summary className="cursor-pointer text-vscode-textLink">Advanced</summary>
				<div className="flex flex-col gap-2 mt-2">
					<label className="text-sm font-medium" htmlFor="db-query-params">
						Postgres query params <span className="text-vscode-descriptionForeground">(optional)</span>
					</label>
					<input
						className={inputClass}
						id="db-query-params"
						onChange={(e) => setQueryParams(e.target.value)}
						placeholder="sslmode=require"
						type="text"
						value={queryParams}
					/>
				</div>
			</details>

			<div className="text-vscode-descriptionForeground text-xs p-2 rounded bg-vscode-input-background">
				Credentials are stored in plaintext in <code>mcp_settings.json</code>, like every other MCP server&apos;s env.
				Because prebuilt tools expose <code>execute_sql</code>, use a{" "}
				<a
					className="text-vscode-textLink hover:underline"
					href="https://mcp-toolbox.dev/documentation/configuration/prebuilt-configs/"
					rel="noreferrer"
					target="_blank">
					read-only database role
				</a>
				.
			</div>

			{error && <div className="text-vscode-errorForeground text-sm p-2 rounded bg-vscode-input-background">{error}</div>}

			<div className="flex gap-2">
				<button
					className="px-4 py-1.5 rounded bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground disabled:opacity-50"
					disabled={loading}
					onClick={handleSubmit}
					type="button">
					{loading ? "Adding..." : "Add Server"}
				</button>
				<button
					className="px-4 py-1.5 rounded bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground hover:bg-vscode-button-secondaryHoverBackground"
					onClick={onDone}
					type="button">
					Cancel
				</button>
			</div>
		</div>
	)
}

export default AddDatabaseServerForm
