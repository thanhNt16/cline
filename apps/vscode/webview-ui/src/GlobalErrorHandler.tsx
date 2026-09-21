import type React from "react"
import { useEffect, useState } from "react"
import { CrashRecoveryCard } from "./components/CrashRecoveryCard"
import { reportWebviewError } from "./utils/reportWebviewError"

/**
 * Catches the classes of error that React error boundaries structurally CANNOT: async callbacks,
 * promise rejections, event-handler throws, and setTimeout throws. Without this, such an error
 * leaves the webview in a broken state with no visible signal — often a solid-black frame — while
 * the extension host keeps running (so the host logs look clean).
 *
 * On the first such error, swap the tree for the same recovery card RootErrorBoundary renders,
 * naming "async" as the source so a screenshot tells us which catcher fired. Recovery is a
 * user-initiated reload (no auto-reload: a persistent error would otherwise loop).
 *
 * Deliberately mounted INSIDE RootErrorBoundary so a render crash in this component is still
 * caught, and as a wrapper around App so the card replaces the crashed tree.
 */
export default function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
	const [error, setError] = useState<Error | null>(null)

	useEffect(() => {
		const toError = (value: unknown): Error => {
			if (value instanceof Error) return value
			if (typeof value === "string") return new Error(value)
			try {
				return new Error(JSON.stringify(value))
			} catch {
				// Circular or otherwise unserializable rejection value: the crash handler must
				// never itself throw.
				return new Error(String(value))
			}
		}

		const onError = (event: ErrorEvent) => {
			const err = toError(event.error ?? event.message)
			reportWebviewError("GlobalErrorHandler:error", err)
			setError(err)
		}
		const onRejection = (event: PromiseRejectionEvent) => {
			const err = toError(event.reason)
			reportWebviewError("GlobalErrorHandler:unhandledrejection", err)
			setError(err)
		}
		window.addEventListener("error", onError)
		window.addEventListener("unhandledrejection", onRejection)
		return () => {
			window.removeEventListener("error", onError)
			window.removeEventListener("unhandledrejection", onRejection)
		}
	}, [])

	if (!error) return <>{children}</>
	return <CrashRecoveryCard error={error} onReload={() => location.reload()} source="async" />
}
