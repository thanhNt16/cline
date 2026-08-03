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
	/** CellockAI preset marker; identifies servers this wizard created. */
	metadata?: { cellockaiPreset: string }
}

const POSTGRES_PREBUILT_ARGS = ["-y", "@toolbox-sdk/server", "--prebuilt=postgres", "--stdio"]

/** Marker stamped onto every postgres server config this wizard writes. */
export const POSTGRES_PRESET = "postgres-mcp-toolbox"

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
		metadata: { cellockaiPreset: POSTGRES_PRESET },
	}
}

/**
 * True when a saved server config was produced by this wizard (identified by
 * its `metadata.cellockaiPreset` marker). Callers must `JSON.parse(server.config)`
 * first — the marker lives inside the config JSON string, not the RPC envelope.
 */
export function isPostgresPresetServer(server: {
	command?: string
	args?: string[]
	metadata?: unknown
}): boolean {
	const metadata = (server as { metadata?: { cellockaiPreset?: string } })?.metadata
	return metadata?.cellockaiPreset === POSTGRES_PRESET
}

/**
 * Reconstructs PostgresConnectionFields from a saved MCP server config.
 * Returns undefined when the server is not a CellockAI postgres preset.
 * `name` is left empty — the caller fills it from the server's key, since the
 * stored config does not carry its own name.
 */
export function parsePostgresConfig(server: {
	command?: string
	args?: string[]
	env?: Record<string, string>
	metadata?: unknown
}): PostgresConnectionFields | undefined {
	if (!isPostgresPresetServer(server)) {
		return undefined
	}
	const env = (server.env ?? {}) as Record<string, string>
	return {
		name: "",
		host: env.POSTGRES_HOST === "127.0.0.1" ? "" : env.POSTGRES_HOST,
		port: env.POSTGRES_PORT === "5432" ? "" : env.POSTGRES_PORT,
		database: env.POSTGRES_DATABASE ?? "",
		user: env.POSTGRES_USER ?? "",
		password: env.POSTGRES_PASSWORD ?? "",
		queryParams: env.POSTGRES_QUERY_PARAMS,
	}
}
