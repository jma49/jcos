import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.majincheng.com',
  // The dev toolbar sits where the JM/OS Dock is. It never ships to production.
  devToolbar: { enabled: false },
  integrations: [
    react(),
    sitemap()
  ],
  vite: {
    plugins: [tailwindcss()],
    // NEXT_PUBLIC_ too: the Supabase integration for Vercel names its
    // variables for Next.js (see src/os/social.ts).
    envPrefix: ['PUBLIC_', 'NEXT_PUBLIC_']
  }
});
