export type Platform = "darwin" | "linux" | "windows"
export type Arch = "arm64" | "amd64"

export interface DownloadProgress {
	bytesDownloaded: number
	bytesTotal: number
	pct: number
}

export interface IndexingResult {
	nodeCount: number
	edgeCount: number
	projectName: string
}

export interface GraphServerConfig {
	port: number
	url: string
}
