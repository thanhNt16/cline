/**
 * Pure builder for mcp-toolbox prebuilt MCP server configs.
 * ponytail: ceiling — single preset (postgres) today. Add MySQL/SQLite/Cloud
 * presets here later; upgrade to Approach B (a `_kind` marker + dedicated
 * addDatabaseServer/editDatabaseServer RPCs) only when a second preset or
 * in-form editing is needed.
 */

export interface PostgresConnectionFields {
	/** MCP server name (also the key in cline_mcp_settings.json). */
	name: string
	/** Optional — defaults to 127.0.0.1. */
	host?: string
	/** Optional — defaults to 5432. */
	port?: string
	/** Required. */
	database: string
	/** Required. */
	user: string
	/** Required. */
	password: string
	/** Optional — appended to the connection string as raw query params. */
	queryParams?: string
}

export interface StdioServerConfig {
	serverName: string
	command: string
	args: string[]
	env: Record<string, string>
}

const POSTGRES_PREBUILT_ARGS = ["-y", "@toolbox-sdk/server", "--prebuilt=postgres", "--stdio"]

export function buildPostgresConfig(fields: PostgresConnectionFields): StdioServerConfig {
	const env: Record<string, string> = {
		POSTGRES_HOST: (fields.host ?? "").trim() || "127.0.0.1",
		POSTGRES_PORT: (fields.port ?? "").trim() || "5432",
		POSTGRES_DATABASE: fields.database,
		POSTGRES_USER: fields.user,
		POSTGRES_PASSWORD: fields.password,
	}
	const queryParams = (fields.queryParams ?? "").trim()
	if (queryParams) {
		env.POSTGRES_QUERY_PARAMS = queryParams
	}
	return {
		serverName: fields.name,
		command: "npx",
		args: POSTGRES_PREBUILT_ARGS,
		env,
	}
}
