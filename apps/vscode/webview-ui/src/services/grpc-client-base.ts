/** biome-ignore-all lint/complexity/noThisInStatic: In static methods, this refers to the constructor (the subclass that invoked the method) when we want to refer to the subclass serviceName.
 *
 * NOTE: This file imports PLATFORM_CONFIG directly rather than using the PlatformProvider
 * because it contains static utility methods that are called from various contexts,
 * including non-React code. The configuration is compile-time constant, so direct
 * import is safe and ensures the methods work consistently regardless of React context.
 */
import { v4 as uuidv4 } from "uuid"
import { PLATFORM_CONFIG } from "../config/platform.config"

export interface Callbacks<TResponse> {
	onResponse: (response: TResponse) => void
	onError: (error: Error) => void
	onComplete: () => void
}

/**
 * Options for streaming gRPC requests.
 */
export interface StreamingOptions {
	/**
	 * Automatically reconnect when the stream ends or errors.
	 * Long-lived subscriptions (state, partial messages) should enable this
	 * so transient disconnections don't permanently strand the webview.
	 * Default: false.
	 */
	autoReconnect?: boolean
	/** Maximum reconnection attempts. Default: Infinity (unlimited). */
	maxRetries?: number
	/** Initial backoff in ms before first retry. Default: 1000. */
	initialBackoffMs?: number
	/** Maximum backoff in ms. Default: 30000. */
	maxBackoffMs?: number
}

export abstract class ProtoBusClient {
	static serviceName: string

	static async makeUnaryRequest<TRequest, TResponse>(
		methodName: string,
		request: TRequest,
		encodeRequest: (_: TRequest) => unknown,
		decodeResponse: (_: { [key: string]: any }) => TResponse,
	): Promise<TResponse> {
		return new Promise((resolve, reject) => {
			const requestId = uuidv4()

			// Set up one-time listener for this specific request
			const handleResponse = (event: MessageEvent) => {
				const message = event.data
				if (message.type === "grpc_response" && message.grpc_response?.request_id === requestId) {
					// Remove listener once we get our response
					window.removeEventListener("message", handleResponse)
					if (message.grpc_response.message) {
						const response = PLATFORM_CONFIG.decodeMessage(message.grpc_response.message, decodeResponse)
						resolve(response)
					} else if (message.grpc_response.error) {
						reject(new Error(message.grpc_response.error))
					} else {
						console.error("Received ProtoBus message with no response or error ", JSON.stringify(message))
					}
				}
			}

			window.addEventListener("message", handleResponse)
			PLATFORM_CONFIG.postMessage({
				type: "grpc_request",
				grpc_request: {
					service: this.serviceName,
					method: methodName,
					message: PLATFORM_CONFIG.encodeMessage(request, encodeRequest),
					request_id: requestId,
					is_streaming: false,
				},
			})
		})
	}

	static makeStreamingRequest<TRequest, TResponse>(
		methodName: string,
		request: TRequest,
		encodeRequest: (_: TRequest) => unknown,
		decodeResponse: (_: { [key: string]: any }) => TResponse,
		callbacks: Callbacks<TResponse>,
		options?: StreamingOptions,
	): () => void {
		const { autoReconnect = false, maxRetries = Infinity, initialBackoffMs = 1000, maxBackoffMs = 30000 } = options ?? {}

		let cancelled = false
		let retryCount = 0
		let currentBackoff = initialBackoffMs
		let retryTimer: ReturnType<typeof setTimeout> | undefined
		let activeCleanup: (() => void) | undefined

		// Tear down the current listener and any pending reconnect timer.
		const cleanup = () => {
			if (activeCleanup) {
				activeCleanup()
				activeCleanup = undefined
			}
			if (retryTimer) {
				clearTimeout(retryTimer)
				retryTimer = undefined
			}
		}

		// Schedule a reconnection attempt (no-op if disabled, cancelled, or exhausted).
		const scheduleReconnect = () => {
			if (cancelled || !autoReconnect) return
			if (retryCount >= maxRetries) {
				console.warn(
					`[grpc-client] Stream reconnection exhausted (${retryCount}/${maxRetries === Infinity ? "∞" : maxRetries}) for ${this.serviceName}.${methodName}`,
				)
				return
			}

			retryTimer = setTimeout(() => {
				retryTimer = undefined
				retryCount++
				// Reset backoff to initial after 5 successful retries so transient
				// blips don't climb to 30s permanently.
				if (retryCount <= 5) {
					currentBackoff = initialBackoffMs
				} else {
					currentBackoff = Math.min(currentBackoff * 2, maxBackoffMs)
				}
				console.log(
					`[grpc-client] Reconnecting ${this.serviceName}.${methodName} (${retryCount}/${maxRetries === Infinity ? "∞" : maxRetries}, backoff: ${currentBackoff}ms)`,
				)
				establishStream()
			}, currentBackoff)
		}

		// Open a new streaming connection. Called on initial setup and each reconnect.
		const establishStream = () => {
			if (cancelled) return

			const requestId = uuidv4()

			const handleResponse = (event: MessageEvent) => {
				const message = event.data
				if (message.type === "grpc_response" && message.grpc_response?.request_id === requestId) {
					if (message.grpc_response.message) {
						// Process streaming message
						const response = PLATFORM_CONFIG.decodeMessage(message.grpc_response.message, decodeResponse)
						callbacks.onResponse(response)
					} else if (message.grpc_response.error) {
						// Handle error — notify and schedule reconnect
						if (callbacks.onError) {
							callbacks.onError(new Error(message.grpc_response.error))
						}
						window.removeEventListener("message", handleResponse)
						activeCleanup = undefined
						scheduleReconnect()
						return
					} else {
						console.error("Received ProtoBus message with no response or error ", JSON.stringify(message))
					}
					if (message.grpc_response.is_streaming === false) {
						if (callbacks.onComplete) {
							callbacks.onComplete()
						}
						// Stream ended by server — treat as disconnection and reconnect.
						// Long-lived subscriptions should never receive is_streaming:false
						// unless the server is shutting down or the stream broke.
						window.removeEventListener("message", handleResponse)
						activeCleanup = undefined
						scheduleReconnect()
					}
				}
			}

			window.addEventListener("message", handleResponse)
			PLATFORM_CONFIG.postMessage({
				type: "grpc_request",
				grpc_request: {
					service: this.serviceName,
					method: methodName,
					message: PLATFORM_CONFIG.encodeMessage(request, encodeRequest),
					request_id: requestId,
					is_streaming: true,
				},
			})

			// Cleanup for this specific connection instance.
			activeCleanup = () => {
				window.removeEventListener("message", handleResponse)
				PLATFORM_CONFIG.postMessage({
					type: "grpc_request_cancel",
					grpc_request_cancel: {
						request_id: requestId,
					},
				})
			}
		}

		establishStream()

		// Return a cancel function that tears down everything (current connection
		// and any pending reconnect timer). Idempotent — safe to call multiple times.
		return () => {
			cancelled = true
			cleanup()
		}
	}
}
