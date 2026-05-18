import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,

  // API files (Node.js)
  {
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  // shared.js — defines globals for other files
  {
    files: ['js/shared.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },

  // admin.js & viewer.js — use globals from shared.js + HTML onclick
  {
    files: ['js/admin.js', 'js/viewer.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        getRoundLabel: 'readonly',
        makeVsDivider: 'readonly',
        esc: 'readonly',
        Html5QrcodeScanner: 'readonly',
        Html5QrcodeScanType: 'readonly',
      },
    },
    rules: {
      // Functions called from HTML via onclick="auth()", onclick="selCount(4)" etc.
      'no-unused-vars': ['error', { varsIgnorePattern: '^(auth|selCount|onCustom|startTournament|closeVoting|applyVoteWinner|resetTournament|vote|toggleScanner)$' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
