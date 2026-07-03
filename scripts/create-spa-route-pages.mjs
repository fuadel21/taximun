import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const publicDir = path.resolve(process.cwd(), "dist", "public");
const sourceIndex = path.join(publicDir, "index.html");

const routes = [
  "auth",
  "passenger",
  "passenger/rides",
  "passenger/book",
  "driver",
  "driver/queue",
  "driver/earnings",
  "admin",
  "admin/dashboard",
  "admin/users",
];

await Promise.all(
  routes.map(async (route) => {
    const routeDir = path.join(publicDir, route);
    await mkdir(routeDir, { recursive: true });
    await copyFile(sourceIndex, path.join(routeDir, "index.html"));
  })
);

console.log(`Created SPA route pages for ${routes.length} routes.`);
