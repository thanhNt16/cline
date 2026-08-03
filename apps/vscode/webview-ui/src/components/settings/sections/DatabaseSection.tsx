import { StringRequest } from "@shared/proto/cline/common"
import { useState } from "react"
import AddDatabaseServerForm from "@/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm"
import {
	isPostgresPresetServer,
	type PostgresConnectionFields,
	parsePostgresConfig,
} from "@/components/mcp/configuration/tabs/add-server/databasePresets"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { McpServiceClient } from "@/services/grpc-client"

interface DatabaseSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

type Mode = { kind: "add" } | { kind: "edit"; name: string; fields: PostgresConnectionFields } | null

const DatabaseSection = ({ renderSectionHeader }: DatabaseSectionProps) => {
	const { mcpServers, navigateToMcp } = useExtensionState()
	const [mode, setMode] = useState<Mode>(null)
	const presets = (mcpServers ?? []).flatMap((server) => {
		try {
			const config = JSON.parse(server.config)
			return isPostgresPresetServer(config) ? [{ name: server.name, config }] : []
		} catch {
			return []
		}
	})

	const handleDelete = async (name: string) => {
		if (!confirm(`Delete the database connection "${name}"?`)) return
		await McpServiceClient.deleteMcpServer(StringRequest.create({ value: name }))
	}

	return (
		<div>
			{renderSectionHeader("mcp-database")}
			<div className="flex flex-col gap-2 p-4">
				<h3 className="text-vscode-fontSize font-bold">PostgreSQL connections (.cellockai/mcp_settings.json)</h3>
				{presets.length === 0 && <p className="text-vscode-descriptionForeground text-sm">No saved connections yet.</p>}
				{presets.map((preset) => {
					const fields = parsePostgresConfig(preset.config)
					return (
						<div
							className="flex items-center justify-between p-2 rounded bg-vscode-input-background"
							key={preset.name}>
							<div className="text-sm">
								<div className="font-medium">{preset.name}</div>
								<div className="text-vscode-descriptionForeground">
									{fields?.database ? `db: ${fields.database}` : ""}{" "}
									{fields?.host ? `· host: ${fields.host}` : ""}
								</div>
							</div>
							<div className="flex gap-2">
								<button
									className="px-2 py-1 rounded bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground text-xs"
									onClick={() =>
										setMode({
											kind: "edit",
											name: preset.name,
											fields: { ...(fields as PostgresConnectionFields), name: preset.name },
										})
									}
									type="button">
									Edit
								</button>
								<button
									className="px-2 py-1 rounded bg-vscode-input-background text-vscode-errorForeground text-xs"
									onClick={() => handleDelete(preset.name)}
									type="button">
									Delete
								</button>
							</div>
						</div>
					)
				})}
				{mode ? (
					<AddDatabaseServerForm
						initialFields={mode.kind === "edit" ? mode.fields : undefined}
						initialName={mode.kind === "edit" ? mode.name : undefined}
						onDone={() => {
							setMode(null)
							navigateToMcp?.("configure")
						}}
					/>
				) : (
					<button
						className="self-start px-3 py-1.5 rounded bg-vscode-button-background text-vscode-button-foreground text-sm"
						onClick={() => setMode({ kind: "add" })}
						type="button">
						Add New
					</button>
				)}
			</div>
		</div>
	)
}

export default DatabaseSection
