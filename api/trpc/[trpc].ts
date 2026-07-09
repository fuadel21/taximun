import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});

// Vercel preserves the original request URL for API functions. Mounting both
// paths makes the handler tolerant to either `/api/trpc/foo` or `/foo`.
app.use("/api/trpc", trpcMiddleware);
app.use("/", trpcMiddleware);

export default app;
