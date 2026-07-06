import ProfilesSection from "./ProfilesSection"

interface ApiConfigurationSectionProps {
	renderSectionHeader?: (tabId: string) => JSX.Element | null
	initialModelTab?: "recommended" | "free"
}

const ApiConfigurationSection = ({ renderSectionHeader }: ApiConfigurationSectionProps) => {
	return (
		<div>
			{renderSectionHeader?.("api-config")}
			{/* CellockAI: provider + model (incl. thinking) are managed entirely via
			    Model Profiles. The manual "API Provider" picker and per-provider
			    config block are intentionally hidden. */}
			<ProfilesSection />
		</div>
	)
}

export default ApiConfigurationSection
