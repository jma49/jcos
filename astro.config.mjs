import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

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
    // NEXT_PUBLIC_ too: the Supabase integration for Vercel names its
    // variables for Next.js (see src/os/social/social.ts).
    envPrefix: ['PUBLIC_', 'NEXT_PUBLIC_'],
    // The commit being built, for About This Mac. Vercel sets it; local builds say "dev".
    define: {
      __JMOS_BUILD__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev')
    }
  }
});
