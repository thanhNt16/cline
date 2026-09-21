import React from "react"
import { reportWebviewError } from "@/utils/reportWebviewError"

interface ChatErrorBoundaryProps {
	children: React.ReactNode
	errorTitle?: string
	errorBody?: string
	height?: string
	/** When any of these values change, a caught error is cleared and children re-render. */
	resetKeys?: unknown[]
}

interface ChatErrorBoundaryState {
	hasError: boolean
	error: Error | null
}

/**
 * A reusable error boundary component specifically designed for chat widgets.
 * It provides a consistent error UI with customizable title and body text.
 */
class ChatErrorBoundary extends React.Component<ChatErrorBoundaryProps, ChatErrorBoundaryState> {
	constructor(props: ChatErrorBoundaryProps) {
		super(props)
		this.state = { hasError: false, error: null }
	}

	static getDerivedStateFromError(error: Error) {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error("Error in ChatErrorBoundary:", error.message)
		console.error("Component stack:", errorInfo.componentStack)
		reportWebviewError("ChatErrorBoundary", error, errorInfo.componentStack ?? undefined)
	}
	componentDidUpdate(prevProps: ChatErrorBoundaryProps) {
		if (!this.state.hasError || !this.props.resetKeys || !prevProps.resetKeys) {
			return
		}
		const changed =
			this.props.resetKeys.length !== prevProps.resetKeys.length ||
			this.props.resetKeys.some((val, idx) => !Object.is(val, prevProps.resetKeys![idx]))
		if (changed) {
			this.setState({ hasError: false, error: null })
		}
	}

	render() {
		const { errorTitle, errorBody, height } = this.props

		if (this.state.hasError) {
			return (
				<div
					style={{
						padding: "10px",
						color: "var(--vscode-errorForeground)",
						height: height || "auto",
						maxWidth: "512px",
						overflow: "auto",
						border: "1px solid var(--vscode-editorError-foreground)",
						borderRadius: "4px",
						backgroundColor: "var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.1))",
					}}>
					<h3 style={{ margin: "0 0 8px 0" }}>{errorTitle || "Something went wrong displaying this content"}</h3>
					<p style={{ margin: "0" }}>{errorBody || `Error: ${this.state.error?.message || "Unknown error"}`}</p>
				</div>
			)
		}

		return this.props.children
	}
}

export default ChatErrorBoundary
