import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // V3 S8b: zod is ~95 KB gzip. Client components import constants from
    // zod-free modules (lib/palette, lib/timezones, lib/view-keys); type-only
    // imports from lib/validation are erased and stay allowed.
    files: ["components/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["zod", "zod/*", "@/lib/validation/*"],
              allowTypeImports: true,
              message:
                "Keeps zod out of the client bundle. Import constants from a zod-free module; `import type` is fine.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
