import { useMemo } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"

export const ProjectConfigSection = () => {
	const { mcpServers, globalSkills, localSkills } = useExtensionState()

	const connectedCount = useMemo(
		() => (mcpServers || []).filter((s) => s.status === "connected").length,
		[mcpServers],
	)
	const disconnectedCount = useMemo(
		() => (mcpServers || []).filter((s) => s.status === "disconnected").length,
		[mcpServers],
	)
	const totalSkills = (globalSkills?.length || 0) + (localSkills?.length || 0)

	return (
		<div className="flex flex-col gap-6 p-4">
			<div>
				<h2 className="text-vscode-fontSize font-bold mb-1">Project Configuration</h2>
				<p className="text-vscode-descriptionForeground text-sm">
					Configuration is stored in the{" "}
					<code className="px-1 py-0.5 rounded bg-vscode-editor-background">.cellockai/</code>{" "}
					directory in your workspace root.
				</p>
			</div>

			{/* MCP Servers Overview */}
			<div className="rounded border border-vscode-panel-border p-4">
				<div className="flex items-center justify-between mb-2">
					<h3 className="font-medium">MCP Servers</h3>
					<div className="flex gap-2 text-sm">
						<span className="text-vscode-descriptionForeground">
							{connectedCount} connected
						</span>
						{disconnectedCount > 0 && (
							<span className="text-vscode-errorForeground">
								{disconnectedCount} disconnected
							</span>
						)}
					</div>
				</div>
				<div className="flex flex-col gap-1">
					{(mcpServers || []).length === 0 ? (
						<p className="text-sm text-vscode-descriptionForeground">No MCP servers configured.</p>
					) : (
						(mcpServers || []).map((server) => (
							<div
								key={server.name}
								className="flex items-center justify-between py-1 px-2 rounded hover:bg-vscode-list-hoverBackground"
							>
								<div className="flex items-center gap-2">
									<span
										className={`inline-block w-2 h-2 rounded-full ${
											server.status === "connected"
												? "bg-vscode-testing-iconPassed"
												: server.status === "connecting"
													? "bg-vscode-editorWarning-foreground"
													: "bg-vscode-testing-iconFailed"
										}`}
									/>
									<span className="text-sm">{server.name}</span>
								</div>
								<span className="text-xs text-vscode-descriptionForeground">
									{server.tools?.length || 0} tools
								</span>
							</div>
						))
					)}
				</div>
				<p className="text-xs text-vscode-descriptionForeground mt-2">
					File: <code>.cellockai/mcp_settings.json</code>
				</p>
			</div>

			{/* Skills Overview */}
			<div className="rounded border border-vscode-panel-border p-4">
				<div className="flex items-center justify-between mb-2">
					<h3 className="font-medium">Skills</h3>
					<span className="text-sm text-vscode-descriptionForeground">
						{totalSkills} total
					</span>
				</div>
				<div className="flex flex-col gap-1">
					{totalSkills === 0 ? (
						<p className="text-sm text-vscode-descriptionForeground">No skills configured.</p>
					) : (
						<>
							{(globalSkills || []).length > 0 && (
								<p className="text-xs text-vscode-descriptionForeground mt-1">
									Global: {globalSkills.length}
								</p>
							)}
							{(localSkills || []).length > 0 && (
								<p className="text-xs text-vscode-descriptionForeground">
									Workspace: {localSkills.length}
								</p>
							)}
						</>
					)}
				</div>
				<p className="text-xs text-vscode-descriptionForeground mt-2">
					Directory: <code>.cellockai/skills/</code>
				</p>
			</div>

			{/* Model Profiles */}
			<div className="rounded border border-vscode-panel-border p-4">
				<h3 className="font-medium mb-1">Model Profiles</h3>
				<p className="text-sm text-vscode-descriptionForeground">
					Model profiles are configured in the Profiles settings tab.
				</p>
				<p className="text-xs text-vscode-descriptionForeground mt-2">
					File: <code>.cellockai/profiles.json</code>
				</p>
			</div>

			{/* .cellockai directory structure reference */}
			<div className="rounded border border-vscode-panel-border p-4">
				<h3 className="font-medium mb-2">.cellockai Directory Structure</h3>
				<pre className="text-xs text-vscode-descriptionForeground font-mono whitespace-pre-wrap">
{`.cellockai/
├── mcp_settings.json   # MCP server configurations
├── mcp.json            # Project MCP merge (optional)
├── profiles.json       # Model profiles
├── skills/             # Skills (one dir per skill, with SKILL.md)
├── rules/              # Rules and instructions
│   ├── workflows/      # Workflow definitions
│   └── hooks/          # Hook scripts
└── mcp-servers/        # MCP server binaries (optional)`}
				</pre>
			</div>
		</div>
	)
}
