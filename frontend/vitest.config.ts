import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/**",
        "src/components/dashboard/lab/**",
        "src/components/dashboard/pharmacy-billing/**",
      ],
      exclude: ["src/test/**", "**/*.test.{ts,tsx}"],
      thresholds: {
        statements: 25,
        functions: 18,
        lines: 25,
      },
    },
  },
});