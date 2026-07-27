import { describe, expect, it } from "vitest"
import { buildPostgresConfig } from "./databasePresets"

describe("buildPostgresConfig", () => {
	it("uses npx with the prebuilt postgres args", () => {
		const cfg = buildPostgresConfig({
			name: "toolbox-postgres",
			database: "appdb",
			user: "appuser",
			password: "secret",
		})
		expect(cfg.command).toBe("npx")
		expect(cfg.args).toEqual(["-y", "@toolbox-sdk/server", "--prebuilt=postgres", "--stdio"])
	})

	it("applies host/port defaults when blank", () => {
		const cfg = buildPostgresConfig({
			name: "pg",
			host: "   ",
			port: "",
			database: "appdb",
			user: "u",
			password: "p",
		})
		expect(cfg.env.POSTGRES_HOST).toBe("127.0.0.1")
		expect(cfg.env.POSTGRES_PORT).toBe("5432")
	})

	it("uses provided host/port", () => {
		const cfg = buildPostgresConfig({
			name: "pg",
			host: "db.example.com",
			port: "6543",
			database: "appdb",
			user: "u",
			password: "p",
		})
		expect(cfg.env.POSTGRES_HOST).toBe("db.example.com")
		expect(cfg.env.POSTGRES_PORT).toBe("6543")
	})

	it("maps database/user/password", () => {
		const cfg = buildPostgresConfig({
			name: "pg",
			database: "appdb",
			user: "u",
			password: "p",
		})
		expect(cfg.env.POSTGRES_DATABASE).toBe("appdb")
		expect(cfg.env.POSTGRES_USER).toBe("u")
		expect(cfg.env.POSTGRES_PASSWORD).toBe("p")
	})

	it("omits POSTGRES_QUERY_PARAMS when blank", () => {
		const cfg = buildPostgresConfig({
			name: "pg",
			database: "appdb",
			user: "u",
			password: "p",
			queryParams: "  ",
		})
		expect(cfg.env).not.toHaveProperty("POSTGRES_QUERY_PARAMS")
	})

	it("includes POSTGRES_QUERY_PARAMS when provided", () => {
		const cfg = buildPostgresConfig({
			name: "pg",
			database: "appdb",
			user: "u",
			password: "p",
			queryParams: "sslmode=require",
		})
		expect(cfg.env.POSTGRES_QUERY_PARAMS).toBe("sslmode=require")
	})

	it("carries the server name through", () => {
		const cfg = buildPostgresConfig({
			name: "my-pg",
			database: "appdb",
			user: "u",
			password: "p",
		})
		expect(cfg.serverName).toBe("my-pg")
	})
})
