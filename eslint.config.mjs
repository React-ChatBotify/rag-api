import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";
import simpleImportSortPlugin from "eslint-plugin-simple-import-sort";
import sortKeysFixPlugin from "eslint-plugin-sort-keys-fix";
import prettierPlugin from "eslint-plugin-prettier";

export default [
  {
    // Ignore patterns (replaces .eslintignore)
    ignores: ["node_modules/**", "build/**", "src/swagger/**"],
  },
  {
    // Apply these settings only to .ts and .tsx files
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: typescriptParser,
    },
    plugins: {
      "@typescript-eslint": typescriptPlugin,
      "simple-import-sort": simpleImportSortPlugin,
      "sort-keys-fix": sortKeysFixPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      // Prettier formatting
      "prettier/prettier": "warn",

      // TypeScript rules
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],

      // Import/export sorting
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",

      // Object key sorting
      "sort-keys-fix/sort-keys-fix": "warn",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
];