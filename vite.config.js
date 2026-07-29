import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The preview's visual-edit transform injects dashed attributes (data-source-location,
// data-dynamic-content) into every JSX element. react-three-fiber treats dashed prop
// names as nested property paths, which crashes 3D scenes. Strip them in 3D files only.
const stripR3FSourceAttrs = () => ({
  name: 'strip-r3f-source-attrs',
  apply: 'serve',
  transform(code, id) {
    if (!/src\/(game|components\/game)\//.test(id)) return null;
    if (!/data-(source-location|dynamic-content)=/.test(code)) return null;
    return { code: code.replace(/\s+data-(?:source-location|dynamic-content)="[^"]*"/g, ''), map: null };
  },
});

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    stripR3FSourceAttrs(),
    react(),
  ],
  optimizeDeps: {
    include: ['@react-three/fiber', '@react-three/drei', 'three']
  }
});