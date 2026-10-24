/**
 * Función serverless de Vercel para /api/trpc/*.
 *
 * IMPORTANTE: el handler real vive empaquetado en `dist/api-trpc.cjs`
 * (lo genera `pnpm build` con esbuild, ver scripts/build-serverless.mjs).
 *
 * Motivo: con "type": "module" en package.json, @vercel/node compila este
 * fichero como ESM y los imports relativos SIN extensión de server/*.ts
 * (p. ej. "../../server/routers") rompen en runtime (ERR_MODULE_NOT_FOUND →
 * FUNCTION_INVOCATION_FAILED). Un bundle CJS autocontenido lo elimina de raíz.
 *
 * El acceso tolerante (default?.default ?? default) cubre las dos formas de
 * interoperabilidad CJS→ESM según el marcador __esModule del bundle.
 */
// @ts-ignore -- generado por pnpm build (dist/api-trpc.d.ts declara los tipos)
import * as bundle from "../../dist/api-trpc.cjs";

const handler = (bundle as any).default?.default ?? (bundle as any).default;

export default handler as (req: any, res: any) => any;
