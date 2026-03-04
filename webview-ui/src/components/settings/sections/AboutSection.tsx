import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import Section from "../Section"

interface AboutSectionProps {
	version: string
	renderSectionHeader: (tabId: string) => JSX.Element | null
}
const AboutSection = ({ version, renderSectionHeader }: AboutSectionProps) => {
	return (
		<div>
			{renderSectionHeader("about")}
			<Section>
				<div className="flex px-4 flex-col gap-2">
					<h2 className="text-lg font-semibold">CellockAI v{version}</h2>
					<p>
						An AI assistant that can use your CLI and Editor. CellockAI can handle complex software development tasks
						step-by-step with tools that let him create & edit files, explore large projects, use the browser, and
						execute terminal commands (after you grant permission).
					</p>

					<h3 className="text-md font-semibold">Community & Support</h3>
					<p>
						<VSCodeLink href="https://x.com/cellockai">X</VSCodeLink>
						{" • "}
						<VSCodeLink href="https://discord.gg/cellockai">Discord</VSCodeLink>
						{" • "}
						<VSCodeLink href="https://www.reddit.com/r/cellockai/"> r/cellockai</VSCodeLink>
					</p>

					<h3 className="text-md font-semibold">Development</h3>
					<p>
						<VSCodeLink href="https://github.com/cellock/cellock-ai">GitHub</VSCodeLink>
						{" • "}
						<VSCodeLink href="https://github.com/cellock/cellock-ai/issues"> Issues</VSCodeLink>
						{" • "}
						<VSCodeLink href="https://github.com/cellock/cellock-ai/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop">
							{" "}
							Feature Requests
						</VSCodeLink>
					</p>

					<h3 className="text-md font-semibold">Resources</h3>
					<p>
						<VSCodeLink href="https://docs.cellock.ai/">Documentation</VSCodeLink>
						{" • "}
						<VSCodeLink href="https://cellock.ai/">https://cellock.ai</VSCodeLink>
					</p>
				</div>
			</Section>
		</div>
	)
}

export default AboutSection
