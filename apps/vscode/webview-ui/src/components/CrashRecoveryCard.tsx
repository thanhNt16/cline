interface CrashRecoveryCardProps {
	error: Error
	onReload: () => void
	/**
	 * Short label explaining which catcher surfaced this card, shown in the header.
	 * Distinguishes a render-phase catch (RootErrorBoundary) from an async/promise catch
	 * (GlobalErrorHandler) when reading the UI or a screenshot.
	 */
	source?: string
}

/**
 * Shared recovery UI for an unrecoverable webview error. Rendered by RootErrorBoundary
 * (synchronous render errors) and GlobalErrorHandler (async / promise / event-handler errors
 * that React error boundaries structurally cannot catch). Keeps the two catchers visually
 * consistent and avoids duplicating the themed fallback markup.
 */
export function CrashRecoveryCard({ error, onReload, source }: CrashRecoveryCardProps) {
	// Cap rendered stack length so a gigantic stack can't itself OOM the fallback UI.
	const stack = (error.stack || error.message || String(error)).slice(0, 4000)
	const via = source ? ` (via ${source})` : ""

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				padding: "24px",
				boxSizing: "border-box",
				backgroundColor: "var(--vscode-editor-background)",
				color: "var(--vscode-foreground)",
				fontFamily: "var(--vscode-editor-font-family, sans-serif)",
				overflow: "auto",
			}}>
			<div
				style={{
					maxWidth: "640px",
					width: "100%",
					border: "1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground))",
					borderRadius: "6px",
					backgroundColor: "var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.08))",
					padding: "20px",
				}}>
				<h2 style={{ margin: "0 0 8px 0", color: "var(--vscode-errorForeground)" }}>CellockAI panel crashed{via}</h2>
				<p style={{ margin: "0 0 16px 0", opacity: 0.9 }}>
					The panel hit an error and was recovered. Your conversation history is safe on the extension side. Reload the
					panel to continue.
				</p>
				<button
					onClick={onReload}
					style={{
						cursor: "pointer",
						border: "none",
						borderRadius: "4px",
						padding: "8px 16px",
						fontSize: "13px",
						fontWeight: 600,
						backgroundColor: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
					}}
					type="button">
					Reload panel
				</button>
				<details style={{ marginTop: "16px" }}>
					<summary style={{ cursor: "pointer", opacity: 0.85 }}>Error details</summary>
					<pre
						style={{
							marginTop: "10px",
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							fontSize: "11px",
							lineHeight: "1.4",
							maxHeight: "40vh",
							overflow: "auto",
							backgroundColor: "var(--vscode-textCodeBlock-background, rgba(0,0,0,0.15))",
							padding: "8px",
							borderRadius: "4px",
						}}>
						{stack}
					</pre>
				</details>
			</div>
		</div>
	)
}

export default CrashRecoveryCard
