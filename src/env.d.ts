interface ImportMetaEnv {
  /** Supabase project URL for Stickies and presence; see supabase/schema.sql. */
  readonly PUBLIC_SUPABASE_URL?: string;
  /** The project's public anon key. Row-level security guards the data. */
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
