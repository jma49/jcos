// Lints React hooks only: the rules of hooks, and effects' dependencies.
// An effect that should run on one trigger but read the latest values
// reads them through useEffectEvent, rather than leaving them out.
// Formatting and style are left to the surrounding code (see AGENTS.md).
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { 'react-hooks': reactHooks },
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
  // The app boundaries (docs/agents/desktop.md). Applets reach JM/OS only
  // through the kit and never each other, so each stays a self-contained
  // unit loaded on demand.
  {
    files: ['src/os/applets/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^\\.\\./(?!\\.\\./kit(/manifest)?$)', message: 'Applets import only src/os/kit and their own folder.' }] }
      ]
    }
  },
  // Built-in apps use the OS freely but not each other, or applets: what
  // two apps share belongs in the OS.
  {
    files: ['src/os/apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^\\.\\./(?!\\.\\./)', message: 'An app doesn’t import another app; move what they share into the OS.' },
            { regex: '/applets/', message: 'Apps don’t import applets.' }
          ]
        }
      ]
    }
  },
  // The OS knows apps only by their manifests, through src/os/catalog.ts.
  {
    files: ['src/os/{core,shell,social,media,look,ambient,kit}/**/*.{ts,tsx}', 'src/os/Desktop.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '(^|/)(apps|applets)/', message: 'The OS reaches apps only through src/os/catalog.ts.' }] }
      ]
    }
  },
  // A manifest is in the first load, so it holds data and a lazy import
  // only: no stylesheet, which arrives with the app's code. (Applets'
  // manifests are held to the applet rule above for their imports.)
  {
    files: ['src/os/{apps,applets}/*/manifest.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportDeclaration[source.value=/\\.css$/]', message: 'A manifest doesn’t import styles; the app’s component does.' }
      ]
    }
  },
  {
    files: ['src/os/apps/*/manifest.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^\\.\\./(?!\\.\\./(kit/manifest|core/icons)$)', message: 'A manifest imports only kit/manifest, core/icons and its own folder.' }
          ]
        }
      ]
    }
  }
];
