import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const publicDir = path.resolve(process.cwd(), "dist", "public");
const sourceIndex = path.join(publicDir, "index.html");

const routes = [
  "auth",
  "test",
  "passenger",
  "passenger/rides",
  "passenger/book",
  "passenger/profile",
  "passenger/security",
  "driver",
  "driver/queue",
  "driver/earnings",
  "driver/profile",
  "driver/security",
  "admin",
  "admin/dashboard",
  "admin/users",
  "admin/safety",
  "admin/support",
];

await Promise.all(
  routes.map(async (route) => {
    const routeDir = path.join(publicDir, route);
    await mkdir(routeDir, { recursive: true });
    await copyFile(sourceIndex, path.join(routeDir, "index.html"));
  })
);

console.log(`Created SPA route pages for ${routes.length} routes.`);
