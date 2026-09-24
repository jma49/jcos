import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://majincheng.com',
  integrations: [
    react(),
    sitemap({
      // Pair each English page with its /zh/ counterpart as hreflang alternates.
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', zh: 'zh-CN' }
      }
    })
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
