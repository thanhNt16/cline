import { UiServiceClient } from "@/services/grpc-client"

/**
 * Forwards a webview crash to the host output channel, where it is actually visible.
 * Fire-and-forget: a crash reporter that itself throws is worse than none, so every failure
 * path here is swallowed.
 */
export function reportWebviewError(source: string, error: unknown, componentStack?: string): void {
	try {
		const err = error instanceof Error ? error : undefined
		const message = err ? err.message : String(error)
		const report = [
			`[webview:${source}] ${message}`,
			err?.stack && `Stack: ${err.stack}`,
			componentStack && `Component stack: ${componentStack}`,
		]
			.filter(Boolean)
			.join("\n")

		UiServiceClient.logToOutput({ value: report }).catch(() => {})
	} catch {
		// Reporting must never mask the original crash.
	}
}
