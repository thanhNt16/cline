import type { DocsIndexTool } from "@shared/proto/cline/docs_index"

export const MCP_SERVER_KEY = "vessel-indexer"

export const DEFAULT_SERVER_URL = "http://localhost:20130"

export const DOCS_INDEX_TOOLS: ReadonlyArray<{ name: string; description: string }> = [
	{ name: "search_documents", description: "Hybrid BM25 + semantic cosine search across a project's indexed documents" },
	{ name: "index_project", description: "Re-scan a project's mount folder and index new/changed files" },
	{ name: "index_url", description: "Crawl a website (same-domain, BFS) and index page text into a project" },
	{ name: "list_projects", description: "List all configured projects with index status" },
	{ name: "project_stats", description: "Detailed statistics for a project's index" },
	{ name: "upload_document", description: "Upload text content and index immediately (base64 for binary)" },
]

export function toProtoTools(): DocsIndexTool[] {
	return DOCS_INDEX_TOOLS.map((t) => ({ name: t.name, description: t.description }))
}
