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
  }
];
