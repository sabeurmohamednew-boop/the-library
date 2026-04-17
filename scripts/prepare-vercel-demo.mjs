import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isVercel = process.env.VERCEL === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const usesLocalSqlite = databaseUrl.startsWith("file:");

if (!isVercel || !usesLocalSqlite) {
  process.exit(0);
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

console.log("[vercel-demo] Preparing temporary SQLite demo database.");
execFileSync(process.execPath, [tsxCli, "prisma/init-db.ts"], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, [tsxCli, "prisma/seed.ts"], { cwd: root, stdio: "inherit" });
