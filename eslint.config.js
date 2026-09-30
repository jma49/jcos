// Lints React hooks (the rules of hooks, and effects' dependencies: an
// effect that should run on one trigger but read the latest values reads
// them through useEffectEvent, rather than leaving them out) and the
// boundaries between the OS, apps and applets (docs/agents/desktop.md).
// Formatting and style are left to the surrounding code (see AGENTS.md).
// tests/eslint.test.ts probes each rule.
import reactHooks from 'eslint-plugin-react-hooks';
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
// A manifest is in the first load, so it holds data and a lazy import only.
const manifestImports = [{ regex: '^\\.\\./(?!\\.\\./(kit/manifest|core/icons)$)', message: 'A manifest imports only kit/manifest, core/icons and its own folder.' }];

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
      'react-hooks/exhaustive-deps': 'error'
    }
  },
  // Vercel's builder compiles each file in api/ to .js without rewriting
  // imports, so a local import names the compiled file (library.js), not
  // the source (library.ts), which isn't deployed.
  {
    files: ['api/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
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
  }
];
