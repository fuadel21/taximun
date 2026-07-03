import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./server/_core/oauth";
import { registerStorageProxy } from "./server/_core/storageProxy";
import { appRouter } from "./server/routers";
import { createContext } from "./server/_core/context";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

const publicDir = path.resolve(process.cwd(), "dist", "public");

if (!fs.existsSync(publicDir)) {
  console.warn(
    `Vercel server could not find ${publicDir}. Make sure the build command runs before the server starts.`
  );
}

app.use(express.static(publicDir));

app.use("*", (_req, res) => {
  res.sendFile(path.resolve(publicDir, "index.html"));
});

const server = createServer(app);

server.listen(Number(process.env.PORT ?? 3000));

export default server;
