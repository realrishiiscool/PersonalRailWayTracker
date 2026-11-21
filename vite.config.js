import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  // GitHub Pages serves this project from /PersonalRailWayTracker/.
  base: process.env.GITHUB_PAGES === 'true' ? '/PersonalRailWayTracker/' : '/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4000' } },
});
