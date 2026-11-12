import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'UVL Expenses',
        short_name: 'UVL Expenses',
        description: 'Scan receipts and track property expenses for Urban Vibes Living.',
        display: 'standalone',
        start_url: '/',
        background_color: '#f6f5f1',
        theme_color: '#1f4d3f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'], maximumFileSizeToCacheInBytes: 5_000_000 },
    }),
  ],
  server: { port: 5173, strictPort: true },
});
