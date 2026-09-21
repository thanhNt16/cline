import React from "react"
import { CrashRecoveryCard } from "./components/CrashRecoveryCard"
import { reportWebviewError } from "./utils/reportWebviewError"

interface RootErrorBoundaryState {
	error: Error | null
}

/**
 * Top-level error boundary for the entire webview. Catches SYNCHRONOUS render errors anywhere in
 * the React tree and shows a visible recovery card instead of an unrecoverable solid-black frame.
 *
 * React error boundaries CANNOT catch async errors, promise rejections, or errors thrown in event
 * handlers / setTimeout — those are handled by GlobalErrorHandler (mounted in main.tsx). Between
 * the two, every recoverable webview error surfaces a card instead of a blank screen.
 *
 * Recovery is `location.reload()` — the host owns the authoritative state, so a full reload is the
 * most reliable way to rebuild a crashed tree.
 */
class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, RootErrorBoundaryState> {
	state: RootErrorBoundaryState = { error: null }

	static getDerivedStateFromError(error: Error) {
		return { error }
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		console.error("[RootErrorBoundary] Render crash:", error)
		console.error("[RootErrorBoundary] Component stack:", info.componentStack)
		reportWebviewError("RootErrorBoundary", error, info.componentStack ?? undefined)
	}

	handleReload = () => {
		location.reload()
	}

	render() {
		const { error } = this.state
		if (!error) return this.props.children
		return <CrashRecoveryCard error={error} onReload={this.handleReload} source="render" />
	}
}

export default RootErrorBoundary
