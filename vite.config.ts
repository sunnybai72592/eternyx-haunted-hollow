import { defineConfig, type Plugin } from "vite";
import { createReleaseStamp } from "./scripts/releaseProvenance.mjs";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Build-time markers share one random build ID across HTML, JS and the JSON manifest.
// Source SHA remains null if Lovable does not expose Git metadata.
const stamp = createReleaseStamp();

function releaseProvenancePlugin(): Plugin {
  return {
    name: "eternyx-public-release-provenance",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: () => [{
        tag: "meta",
        attrs: { name: "eternyx-build-id", content: stamp.build_id },
        injectTo: "head",
      }],
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "release-info.json",
        source: JSON.stringify(stamp) + "\n",
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __ETERNYX_BUILD_ID__: JSON.stringify(stamp.build_id),
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    allowedHosts: true,
  },
  plugins: [
    react(),
    releaseProvenancePlugin(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
