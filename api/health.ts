export default function handler(_req: any, res: any) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, service: "taximun-api", runtime: "vercel", timestamp: new Date().toISOString() }));
}
