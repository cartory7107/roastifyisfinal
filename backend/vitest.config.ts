import { defineConfig } from "vitest/config";

/**
 * The backend is ESM with NodeNext resolution, so source imports carry `.js`
 * extensions. Vite must resolve those back to the `.ts` files during tests.
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: "$1" }],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    clearMocks: true,
  },
});
