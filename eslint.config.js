// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['ScrollView', 'FlatList'],
              message: "Import from '@/components/scroll-view', which hides scroll bars app-wide.",
            },
          ],
        },
      ],
      // React Compiler doesn't see `setting.use()` as a hook, caches it and skips it on later
      // renders, so React crashes with "Cannot read property 'next' of undefined".
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='use']:not([callee.object.name='React'])",
          message: 'Export it as a `useSomething` hook (`export const useX = setting.use`) and call that: React Compiler skips `obj.use()` on re-renders.',
        },
      ],
    },
  },
]);
