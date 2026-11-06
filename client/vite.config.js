import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development /api is proxied to the Express server, so no CORS or env setup is needed.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:5000' } },
});
