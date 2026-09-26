interface ImportMetaEnv {
  /** Supabase project URL for Stickies and presence; see supabase/schema.sql. */
  readonly PUBLIC_SUPABASE_URL?: string;
  /** The project's public anon key. Row-level security guards the data. */
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  /** The same values as named by the Supabase integration for Vercel. */
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The short commit hash this build came from, or "dev" (astro.config.mjs). */
declare const __JMOS_BUILD__: string;
