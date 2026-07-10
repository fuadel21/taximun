import "dotenv/config";
import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

function getTrpcPath(req: any) {
  const queryPath = req.query?.trpc;
  if (Array.isArray(queryPath)) return queryPath.join("/");
  if (typeof queryPath === "string") return queryPath;

  const url = new URL(req.url || "/", "https://taximun.vercel.app");
  return decodeURIComponent(url.pathname.replace(/^\/api\/trpc\/?/, ""));
}

export default async function handler(req: any, res: any) {
  res.setHeader("x-taximun-api", "trpc-node-handler");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const path = getTrpcPath(req);

  return nodeHTTPRequestHandler({
    router: appRouter,
    req,
    res,
    path,
    createContext: (opts) => createContext(opts as any),
    onError({ error, path }) {
      console.error("Taximun tRPC error", { path, message: error.message, code: error.code });
    },
  });
}
