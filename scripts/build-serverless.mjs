/**
 * Empaqueta la función serverless /api/trpc de Vercel en un único CJS
 * autocontenido (dist/api-trpc.cjs) + su declaración de tipos.
 * Lo llama `pnpm build` (ver package.json → scripts.build).
 */
import { build } from "esbuild";
import { writeFile } from "node:fs/promises";

await build({
  entryPoints: ["server/api-trpc-handler.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: "dist/api-trpc.cjs",
  sourcemap: true,
  legalComments: "none",
  logLevel: "warning",
});

await writeFile(
  "dist/api-trpc.d.ts",
  "declare const handler: (req: any, res: any) => any;\nexport default handler;\n",
);

console.log("✓ dist/api-trpc.cjs + dist/api-trpc.d.ts (función serverless empaquetada)");
