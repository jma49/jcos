// Lints React hooks (the rules of hooks, and effects' dependencies: an
// effect that should run on one trigger but read the latest values reads
// them through useEffectEvent, rather than leaving them out), the
// boundaries between the OS, apps and applets (docs/agents/desktop.md),
// that anything remembered in the browser goes through core/storage.ts,
// that no block (a catch above all) is empty without a comment saying why,
// and, in scripts/, ESLint's recommended rules. Formatting is Biome's
// (biome.jsonc, `npm run format`). tests/eslint.test.ts
// probes each rule.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// import() is how the desktop loads almost everything, and ESLint's
// no-restricted-imports looks only at import and export declarations. This
// rule holds a dynamic import with a literal path to the same patterns
// ({ regex, message }, as no-restricted-imports takes them).
const noRestrictedDynamicImports = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          patterns: {
            type: 'array',
            items: { type: 'object', properties: { regex: { type: 'string' }, message: { type: 'string' } }, required: ['regex', 'message'], additionalProperties: false }
          }
        },
        additionalProperties: false
      }
    ],
    messages: { restricted: "'{{path}}' import is restricted from being used by a pattern. {{message}}" }
  },
  create(context) {
    const patterns = (context.options[0]?.patterns ?? []).map(({ regex, message }) => ({ regex: new RegExp(regex), message }));
    return {
      ImportExpression({ source }) {
        const path =
          source.type === 'Literal' && typeof source.value === 'string'
            ? source.value
            : source.type === 'TemplateLiteral' && source.expressions.length === 0
              ? source.quasis[0].value.cooked
              : null;
        if (path === null) return;
        for (const { regex, message } of patterns) {
          if (regex.test(path)) context.report({ node: source, messageId: 'restricted', data: { path, message } });
        }
      }
    };
  }
};

/** Holds a file's imports, declarations and import() alike, to `patterns`. */
const imports = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
  'local/no-restricted-dynamic-imports': ['error', { patterns }]
});

// The app boundaries. Applets reach JM/OS only through the kit and never
// each other, so each stays a self-contained unit loaded on demand.
const appletImports = [{ regex: '^\\.\\./(?!\\.\\./kit(/manifest)?$)', message: 'Applets import only src/os/kit and their own folder.' }];
// Built-in apps use the OS freely but not each other, or applets: what
// two apps share belongs in the OS. A sibling is one ../ away, or any
// number and then apps/.
const appImports = [
  { regex: '^\\.\\./(?!\\.\\./)', message: 'An app doesn’t import another app; move what they share into the OS.' },
  { regex: '^(\\.\\./){2,}apps/', message: 'An app doesn’t import another app; move what they share into the OS.' },
  { regex: '/applets/', message: 'Apps don’t import applets.' }
];
// The OS knows apps only by their manifests, through src/os/catalog.ts.
const osImports = [{ regex: '(^|/)(apps|applets)/', message: 'The OS reaches apps only through src/os/catalog.ts.' }];
// core/ is the base layer every part of the OS uses: it imports values
// only from itself and the catalog, and from the domain folders (files/,
// media/, social/…) types alone, so no domain's code is in it by way of an
// import (docs/agents/desktop.md, "Where new code goes").
const coreImports = [
  { regex: '^\\.\\./(?!catalog$)', allowTypeImports: true, message: 'core/ imports only types from the rest of the OS; move shared code into its domain.' }
];
// A manifest is in the first load, so it holds data and a lazy import only.
const manifestImports = [{ regex: '^\\.\\./(?!\\.\\./(kit/manifest|core/icons)$)', message: 'A manifest imports only kit/manifest, core/icons and its own folder.' }];

const storageMessage = 'Anything remembered in the browser goes through src/os/core/storage.ts.';
const storageGlobals = ['localStorage', 'sessionStorage'];

// A later block that sets the same rule for the same file replaces the
// earlier block's options (docs/agents/pitfalls.md): the file sets below
// are kept apart, and a manifest's stricter patterns replace its app's on
// purpose.
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { 'react-hooks': reactHooks, local: { rules: { 'no-restricted-dynamic-imports': noRestrictedDynamicImports } } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // An error caught and carried on from is reported, or its catch says
      // why it's expected (docs/decisions/0022): a block holding only a
      // comment passes.
      'no-empty': 'error'
    }
  },
  // Vercel's builder compiles each file in api/ to .js without rewriting
  // imports, so a local import names the compiled file (library.js), not
  // the source (library.ts), which isn't deployed.
  {
    files: ['api/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-empty': 'error',
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^\\.{1,2}/.*\\.tsx?$', message: 'Import local TypeScript by its .js name: Vercel deploys the compiled file.' }] }
      ]
    }
  },
  {
    files: ['src/os/applets/**/*.{ts,tsx}'],
    rules: imports(appletImports)
  },
  {
    files: ['src/os/apps/**/*.{ts,tsx}'],
    rules: imports(appImports)
  },
  // Every folder of the OS, present and future, but the apps, the applets
  // and the catalog that lists them.
  {
    files: ['src/os/**/*.{ts,tsx}'],
    ignores: ['src/os/apps/**', 'src/os/applets/**', 'src/os/catalog*'],
    rules: imports(osImports)
  },
  // typescript-eslint's own rule, so it doesn't replace the OS block's
  // no-restricted-imports above, and so `import type` passes. A dynamic
  // import from core/ loads a value too: held to the same patterns.
  {
    files: ['src/os/core/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: coreImports }],
      'local/no-restricted-dynamic-imports': ['error', { patterns: [...osImports, ...coreImports.map(({ regex, message }) => ({ regex, message }))] }]
    }
  },
  // A manifest holds no stylesheet, which arrives with the app's code.
  // (Applets' manifests are held to the applet rule above for their imports.)
  {
    files: ['src/os/{apps,applets}/*/manifest.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportDeclaration[source.value=/\\.css$/]', message: 'A manifest doesn’t import styles; the app’s component does.' }
      ]
    }
  },
  // Declarations only: a manifest's import() (its component, styles and
  // data) is lazy, and held to the app rule above.
  {
    files: ['src/os/apps/*/manifest.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: manifestImports }] }
  },
  // The scripts in scripts/ run under Node, some against production (the
  // photo refresh, the songs snapshot, the job-hunt import): ESLint's
  // recommended rules catch an undefined name or an unused variable before
  // they run. The scripts that drive a browser through Playwright pass it
  // functions to run in the page, so they know the browser's globals too.
  {
    files: ['scripts/**/*.{js,mjs,ts}'],
    languageOptions: { parser: tseslint.parser, globals: globals.node },
    rules: js.configs.recommended.rules
  },
  {
    files: ['scripts/{smoke,perf-audit,capture-previews}.mjs'],
    languageOptions: { globals: globals.browser }
  },
  // Storage can be missing, blocked or full, and every tab of a visitor
  // shares it: core/storage.ts handles both (AGENTS.md), so nothing else
  // touches localStorage or sessionStorage, bare or on window.
  {
    files: ['src/os/**/*.{ts,tsx}'],
    ignores: ['src/os/core/storage.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', ...storageGlobals.map((name) => ({ name, message: storageMessage }))],
      'no-restricted-properties': ['error', ...storageGlobals.flatMap((property) => ['window', 'globalThis'].map((object) => ({ object, property, message: storageMessage })))]
    }
  }
];
