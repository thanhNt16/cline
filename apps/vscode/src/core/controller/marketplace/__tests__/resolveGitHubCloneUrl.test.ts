import { describe, it } from "bun:test"
import { expect } from "chai"
import { resolveGitHubCloneUrl } from "../marketplace-helpers"

describe("resolveGitHubCloneUrl", () => {
	it("parses a plain https GitHub URL", () => {
		const r = resolveGitHubCloneUrl("https://github.com/obra/superpowers")
		expect(r.url).to.equal("https://github.com/obra/superpowers.git")
		expect(r.repoName).to.equal("superpowers")
	})

	it("strips a trailing .git from an https URL", () => {
		const r = resolveGitHubCloneUrl("https://github.com/obra/superpowers.git")
		expect(r.url).to.equal("https://github.com/obra/superpowers.git")
		expect(r.repoName).to.equal("superpowers")
	})

	it("strips trailing slash and subpaths", () => {
		const r = resolveGitHubCloneUrl("https://github.com/owner/repo/tree/main/sub")
		expect(r.url).to.equal("https://github.com/owner/repo.git")
		expect(r.repoName).to.equal("repo")
	})

	it("strips a trailing slash", () => {
		const r = resolveGitHubCloneUrl("https://github.com/owner/repo/")
		expect(r.url).to.equal("https://github.com/owner/repo.git")
	})

	it("accepts www. prefix", () => {
		const r = resolveGitHubCloneUrl("https://www.github.com/owner/repo")
		expect(r.url).to.equal("https://github.com/owner/repo.git")
	})

	it("accepts git+https prefix", () => {
		const r = resolveGitHubCloneUrl("git+https://github.com/owner/repo.git")
		expect(r.url).to.equal("https://github.com/owner/repo.git")
	})

	it("accepts SSH form git@github.com:owner/repo.git", () => {
		const r = resolveGitHubCloneUrl("git@github.com:owner/repo.git")
		expect(r.url).to.equal("https://github.com/owner/repo.git")
		expect(r.repoName).to.equal("repo")
	})

	it("accepts SSH form without .git", () => {
		const r = resolveGitHubCloneUrl("git@github.com:owner/repo")
		expect(r.url).to.equal("https://github.com/owner/repo.git")
	})

	it("resolves owner/repo shorthand", () => {
		const r = resolveGitHubCloneUrl("obra/superpowers")
		expect(r.url).to.equal("https://github.com/obra/superpowers.git")
		expect(r.repoName).to.equal("superpowers")
	})

	it("resolves owner/repo shorthand with .git", () => {
		const r = resolveGitHubCloneUrl("obra/superpowers.git")
		expect(r.url).to.equal("https://github.com/obra/superpowers.git")
	})

	it("rejects empty input", () => {
		expect(() => resolveGitHubCloneUrl("   ")).to.throw(/Empty skill source/)
	})

	it("rejects non-GitHub https URL", () => {
		expect(() => resolveGitHubCloneUrl("https://gitlab.com/owner/repo")).to.throw(/Not a GitHub URL/)
	})

	it("rejects unresolvable input", () => {
		expect(() => resolveGitHubCloneUrl("not a repo")).to.throw(/Could not resolve GitHub repository/)
	})

	it("rejects malformed URL", () => {
		expect(() => resolveGitHubCloneUrl("https://github.com/")).to.throw(/Cannot derive owner\/repo/)
	})
})
