import { SVGProps } from "react"

/**
 * CellockAILogo renders the CellockAI brand mark: an orange hexagonal ring
 * with a gray "C" triangle. Brand colors are fixed (not theme-adapted) so the
 * logo reads consistently across light/dark VS Code themes. Geometry matches
 * assets/icons/icon.svg.
 */
const CellockAILogo = (props: SVGProps<SVGSVGElement>) => (
	<svg fill="none" viewBox="0 0 412 452" xmlns="http://www.w3.org/2000/svg" {...props}>
		<path
			d="M 206,44 L 310,103 L 309,328 L 194,387 L 50,302 L 46,139 Z M 269.9,126.2 L 269.1,303.5 L 195.4,341.3 L 89.4,278.8 L 86.6,161.4 L 206.5,90.2 Z"
			fill="#F87010"
			fillRule="evenodd"
		/>
		<path d="M 200,219 L 348,130 L 348,300 Z" fill="#686870" />
	</svg>
)

export default CellockAILogo
