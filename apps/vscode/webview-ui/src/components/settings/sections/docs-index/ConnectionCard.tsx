import { useState } from "react"
import { PingRequest, RegisterMcpRequest } from "@shared/proto/cline/docs_index"
import { EmptyRequest } from "@shared/proto/cline/common"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface ConnectionCardProps {
	serverUrl: string
	setServerUrl: (url: string) => void
	connected: boolean
	setConnected: (connected: boolean) => void
	onConnected: () => void
}

export default function ConnectionCard({
	serverUrl,
	setServerUrl,
	connected,
	setConnected,
	onConnected,
}: ConnectionCardProps) {
	const [connecting, setConnecting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleConnect = async () => {
		setConnecting(true)
		setError(null)
		try {
			const result = await DocsIndexServiceClient.ping(PingRequest.create({ serverUrl }))
			if (result.connected) {
				setConnected(true)
				await DocsIndexServiceClient.registerMcpServer(RegisterMcpRequest.create({ serverUrl }))
				onConnected()
			} else {
				setError("Could not connect to the server. Make sure it is running.")
			}
		} catch (err) {
			setError(`Connection failed: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setConnecting(false)
		}
	}

	const handleDisconnect = async () => {
		try {
			await DocsIndexServiceClient.unregisterMcpServer(EmptyRequest.create({}))
		} catch (err) {
			console.error("Failed to unregister MCP server:", err)
		}
		setConnected(false)
	}

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
			}}>
			<div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Connection</div>
			<div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
				<input
					type="text"
					value={serverUrl}
					onChange={(e) => setServerUrl(e.target.value)}
					disabled={connected || connecting}
					placeholder="http://localhost:20130"
					style={{
						flex: 1,
						padding: "4px 8px",
						fontSize: "12px",
						background: "var(--vscode-input-background)",
						color: "var(--vscode-input-foreground)",
						border: "1px solid var(--vscode-input-border)",
						borderRadius: "3px",
					}}
				/>
				{connected ? (
					<button
						onClick={handleDisconnect}
						style={{
							padding: "4px 12px",
							fontSize: "12px",
							cursor: "pointer",
							background: "var(--vscode-button-secondaryBackground)",
							color: "var(--vscode-button-secondaryForeground)",
							border: "none",
							borderRadius: "3px",
						}}>
						Disconnect
					</button>
				) : (
					<button
						onClick={handleConnect}
						disabled={connecting || !serverUrl}
						style={{
							padding: "4px 12px",
							fontSize: "12px",
							cursor: connecting || !serverUrl ? "not-allowed" : "pointer",
							background: "var(--vscode-button-background)",
							color: "var(--vscode-button-foreground)",
							border: "none",
							borderRadius: "3px",
							opacity: connecting || !serverUrl ? 0.7 : 1,
						}}>
						{connecting ? "Connecting..." : "Connect"}
					</button>
				)}
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
				<span
					style={{
						display: "inline-block",
						width: "8px",
						height: "8px",
						borderRadius: "50%",
						background: connected
							? "var(--vscode-testing-iconPassed)"
							: "var(--vscode-testing-iconFailed)",
					}}
				/>
				<span style={{ color: "var(--vscode-descriptionForeground)" }}>
					{connected ? "Connected" : "Not connected"}
				</span>
			</div>
			{error && (
				<div
					style={{
						marginTop: "8px",
						fontSize: "12px",
						color: "var(--vscode-errorForeground)",
					}}>
					{error}
				</div>
			)}
		</div>
	)
}
