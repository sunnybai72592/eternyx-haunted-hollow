import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// This public marker must agree with the HTML meta tag and release-info.json.
// It proves this JS bundle and HTML were built together, not that the release
// or authenticated backend functionality is approved for production.
declare const __ETERNYX_BUILD_ID__: string;
document.documentElement.setAttribute("data-eternyx-build-id", __ETERNYX_BUILD_ID__);

createRoot(document.getElementById("root")!).render(<App />);
