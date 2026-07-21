import type { CodebaseMemoryTool } from "@shared/proto/cline/codebase_memory"

export const GITHUB_OWNER = "DeusData"
export const GITHUB_REPO = "codebase-memory-mcp"

/**
 * The codebase-memory-mcp release this extension installs and requires.
 * Pinned (not "latest") because the CLI's argument contract has changed
 * between releases before (e.g. flag-based args only landed in v0.9.0) —
 * floating on "latest" silently breaks indexing when upstream ships a
 * CLI-incompatible release. Bump this deliberately, in lockstep with any
 * change to how this extension invokes the CLI.
 */
export const CBM_PINNED_VERSION = "v0.9.0"

export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/${CBM_PINNED_VERSION}`

export const GITHUB_API_RELEASES_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${CBM_PINNED_VERSION}`

export const DEFAULT_GRAPH_PORT = 9749
export const GRAPH_PORT_FALLBACKS = [9750, 9751]

export const BINARY_SUBDIR = "codebase-memory-mcp"
export const BINARY_NAME = "codebase-memory-mcp"
export const UI_BINARY_SUBDIR = "codebase-memory-mcp-ui"
export const UI_BINARY_NAME = "codebase-memory-mcp"

export const MCP_SERVER_KEY = "codebase-memory-mcp"

export const INDEXING_TIMEOUT_MS = 10 * 60 * 1000
export const INDEXING_NO_OUTPUT_TIMEOUT_MS = 10 * 60 * 1000

export const CODEBASE_MEMORY_TOOLS: ReadonlyArray<{ name: string; description: string }> = [
	{ name: "index_repository", description: "Index a repository into the knowledge graph" },
	{ name: "list_projects", description: "List all indexed projects with node/edge counts" },
	{ name: "delete_project", description: "Remove a project and all its graph data" },
	{ name: "index_status", description: "Check indexing status of a project" },
	{ name: "search_graph", description: "Structured search by label, name pattern, file pattern, degree filters" },
	{ name: "trace_path", description: "BFS traversal — who calls a function and what it calls" },
	{ name: "detect_changes", description: "Map git diff to affected symbols with risk classification" },
	{ name: "query_graph", description: "Execute Cypher-like read-only graph queries" },
	{ name: "get_graph_schema", description: "Node/edge counts, relationship patterns, property definitions" },
	{ name: "get_code_snippet", description: "Read source code for a function by qualified name" },
	{ name: "get_architecture", description: "Codebase overview: languages, packages, routes, hotspots, clusters" },
	{ name: "search_code", description: "Graph-augmented grep over indexed project files" },
	{ name: "manage_adr", description: "Create or update Architecture Decision Records" },
	{ name: "ingest_traces", description: "Ingest runtime traces to enhance the knowledge graph" },
]

export function toProtoTools(): CodebaseMemoryTool[] {
	return CODEBASE_MEMORY_TOOLS.map((t) => ({ name: t.name, description: t.description }))
}
