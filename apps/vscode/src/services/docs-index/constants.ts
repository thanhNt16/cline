import type { DocsIndexTool } from "@shared/proto/cline/docs_index"

export const MCP_SERVER_KEY = "vessel-indexer"

export const DEFAULT_SERVER_URL = "http://localhost:20130"

export const DOCS_INDEX_TOOLS: ReadonlyArray<{ name: string; description: string }> = [
	{ name: "create_project", description: "Create a new docindex project (collection + sparse index)" },
	{ name: "list_projects", description: "List all existing docindex projects" },
	{ name: "index_document", description: "Index a document from a local filesystem path. Returns a task id" },
	{ name: "index_url", description: "Index a document fetched from a URL. Returns a task id" },
	{ name: "get_task", description: "Get the status/progress of an indexing task by id" },
	{ name: "search", description: "Hybrid (dense+sparse, RRF) search across a project" },
	{ name: "delete_document", description: "Delete an indexed document by project + source name" },
]

export function toProtoTools(): DocsIndexTool[] {
	return DOCS_INDEX_TOOLS.map((t) => ({ name: t.name, description: t.description }))
}
