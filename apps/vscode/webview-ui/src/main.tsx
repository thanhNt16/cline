import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./main.css"
import "./index.css"
import App from "./App.tsx"
import GlobalErrorHandler from "./GlobalErrorHandler.tsx"
import RootErrorBoundary from "./RootErrorBoundary.tsx"

// Two-layer catch so no recoverable webview error leaves a solid-black frame:
//   RootErrorBoundary  — synchronous render errors
//   GlobalErrorHandler — async / promise / event-handler errors (boundary blind spot)
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RootErrorBoundary>
			<GlobalErrorHandler>
				<App />
			</GlobalErrorHandler>
		</RootErrorBoundary>
	</StrictMode>,
)
