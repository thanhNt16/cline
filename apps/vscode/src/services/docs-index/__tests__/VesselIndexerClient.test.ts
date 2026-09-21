import { afterEach, describe, expect, it, mock } from "bun:test"
import { VesselIndexerClient } from "../VesselIndexerClient"

const json = (body: unknown, ok = true) =>
	Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as any)

describe("VesselIndexerClient crawl", () => {
	const original = globalThis.fetch
	afterEach(() => {
		globalThis.fetch = original
	})

	it("crawlUrl POSTs body with caps and returns crawl_id+task_id", async () => {
		let captured: any
		globalThis.fetch = mock((input: any, init?: any) => {
			captured = { url: input, init }
			return json({ crawl_id: "c1", task_id: "t1" }, true)
		}) as any
		const c = new VesselIndexerClient("http://srv")
		const out = await c.crawlUrl("proj", "https://x.io", 3, 50)
		expect(out).toEqual({ crawl_id: "c1", task_id: "t1" })
		expect(captured.url).toBe("http://srv/projects/proj/crawls")
		expect(captured.init.method).toBe("POST")
		expect(JSON.parse(captured.init.body)).toEqual({ url: "https://x.io", max_depth: 3, max_pages: 50 })
	})

	it("crawlUrl omits caps when not provided", async () => {
		let captured: any
		globalThis.fetch = mock((input: any, init?: any) => {
			captured = { url: input, init }
			return json({ crawl_id: "c1", task_id: "t1" })
		}) as any
		await new VesselIndexerClient("http://srv").crawlUrl("proj", "https://x.io")
		expect(JSON.parse(captured.init.body)).toEqual({ url: "https://x.io" })
	})

	it("listCrawls returns the bare array", async () => {
		const rows = [
			{ crawl_id: "c1", root_url: "r", status: "done", max_depth: 3, max_pages: 50, page_count: 2, created_at: "1" },
		]
		globalThis.fetch = mock(() => json(rows)) as any
		const out = await new VesselIndexerClient("http://srv").listCrawls("proj")
		expect(out).toEqual(rows)
	})

	it("getCrawl returns {crawl, pages}", async () => {
		globalThis.fetch = mock(() => json({ crawl: { crawl_id: "c1" }, pages: [] })) as any
		const out = await new VesselIndexerClient("http://srv").getCrawl("proj", "c1")
		expect(out.crawl.crawl_id).toBe("c1")
		expect(out.pages).toEqual([])
	})

	it("refreshCrawl POSTs to /refresh and returns task_id", async () => {
		let captured: any
		globalThis.fetch = mock((input: any, init?: any) => {
			captured = { url: input, init }
			return json({ task_id: "t9" }, true)
		}) as any
		const out = await new VesselIndexerClient("http://srv").refreshCrawl("proj", "c1")
		expect(out).toEqual({ task_id: "t9" })
		expect(captured.init.method).toBe("POST")
		expect(captured.url).toBe("http://srv/projects/proj/crawls/c1/refresh")
	})

	it("deleteCrawl DELETEs and returns status", async () => {
		let captured: any
		globalThis.fetch = mock((input: any, init?: any) => {
			captured = { url: input, init }
			return json({ status: "deleted" })
		}) as any
		const out = await new VesselIndexerClient("http://srv").deleteCrawl("proj", "c1")
		expect(out).toEqual({ status: "deleted" })
		expect(captured.init.method).toBe("DELETE")
	})

	it("throws on non-ok", async () => {
		globalThis.fetch = mock(() => json({}, false)) as any
		expect(new VesselIndexerClient("http://srv").listCrawls("p")).rejects.toThrow(/List crawls failed/)
	})
})
