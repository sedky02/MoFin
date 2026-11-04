const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*'] },
  {
    // Node scripts and config files: CommonJS with Node globals.
    files: ['scripts/**/*.js', '*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { __dirname: 'readonly', require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly' },
    },
  },
  {
    // Bundle size: Metro doesn't tree-shake, so a package root pulls in everything it exports.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react-native',
              allowTypeImports: true,
              message: "Import icons from '@/lib/icons' (run npm run icons:sync after adding one); the package root bundles all ~1,600 icons.",
            },
            {
              name: '@expo-google-fonts/inter',
              message: "Import a weight from its own path ('@expo-google-fonts/inter/500Medium'); the root bundles all 18 font files.",
            },
          ],
        },
      ],
    },
  },
]);
