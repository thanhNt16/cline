import { describe, expect, it, mock } from "bun:test"

// Mock StateManager before importing oauth
mock.module("@/core/storage/StateManager", () => ({
	StateManager: {
		get: () => ({
			getSecretKey: () => undefined,
			setSecret: () => {},
			flushPendingState: async () => {},
		}),
	},
}))

mock.module("@/shared/net", () => ({ fetch: async () => ({ ok: false, status: 599, json: async () => ({}) }) }))

import { OpenAiCodexOAuthManager } from "./oauth"

describe("OpenAiCodexOAuthManager absent-credential cooldown", () => {
	function getAbsentTimestamp(manager: OpenAiCodexOAuthManager): number {
		const target: Record<string, unknown> = manager as unknown as Record<string, unknown>
		const value = target.lastAbsentLoadAt
		return typeof value === "number" ? value : 0
	}

	function setAbsentTimestamp(manager: OpenAiCodexOAuthManager, timestamp: number): void {
		const target: Record<string, unknown> = manager as unknown as Record<string, unknown>
		target.lastAbsentLoadAt = timestamp
	}

	it("coalesces repeated absent lookups to one provider-settings read per cooldown window", async () => {
		const manager = new OpenAiCodexOAuthManager()
		setAbsentTimestamp(manager, 0)

		const first = await manager.loadCredentials()
		expect(first).toBeNull()

		const now = Date.now()
		setAbsentTimestamp(manager, now)
		await manager.loadCredentials()
		await manager.loadCredentials()
		expect(getAbsentTimestamp(manager)).toBe(now)
	})

	it("clearCredentials resets the cooldown so the next absent lookup re-reads", async () => {
		const manager = new OpenAiCodexOAuthManager()
		await manager.loadCredentials()
		const stamped = getAbsentTimestamp(manager)
		expect(stamped).toBeGreaterThan(0)

		await manager.clearCredentials()
		expect(getAbsentTimestamp(manager)).toBe(0)
	})
})
