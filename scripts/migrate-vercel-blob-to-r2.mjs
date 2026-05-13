import fs from "node:fs";
import { Readable } from "node:stream";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { list } from "@vercel/blob";

const PREFIXES = ["books/", "covers/"];

function loadEnvFile(pathname = ".env") {
  if (!fs.existsSync(pathname)) return;

  const text = fs.readFileSync(pathname, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function r2Client() {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const endpoint = process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    bucket: requiredEnv("R2_BUCKET_NAME"),
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
      },
      forcePathStyle: true,
    }),
  };
}

async function listAllBlobObjects(prefix) {
  const blobs = [];
  let cursor;

  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return blobs;
}

async function headR2Object(client, bucket, key) {
  try {
    return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey") return null;
    throw error;
  }
}

function toNodeReadable(stream) {
  if (!stream) throw new Error("Vercel Blob returned no stream.");
  return Readable.fromWeb(stream);
}

async function copyOne(client, bucket, blob) {
  const existing = await headR2Object(client, bucket, blob.pathname);
  if (existing?.ContentLength === blob.size) {
    return { status: "verified-existing", key: blob.pathname, size: blob.size };
  }

  const source = await fetch(blob.url, { cache: "no-store" });
  if (!source.ok || !source.body) {
    const text = await source.text().catch(() => "");
    throw new Error(`Vercel Blob object could not be read: ${source.status} ${source.statusText}${text ? ` - ${text.slice(0, 120)}` : ""}`);
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: blob.pathname,
      Body: toNodeReadable(source.body),
      ContentLength: blob.size,
      ContentType: source.headers.get("content-type") || "application/octet-stream",
    }),
  );

  const copied = await headR2Object(client, bucket, blob.pathname);
  if (!copied) {
    throw new Error("Copied object was not found in R2.");
  }

  if (copied.ContentLength !== blob.size) {
    throw new Error(`R2 size mismatch: expected ${blob.size}, got ${copied.ContentLength}.`);
  }

  return { status: "copied", key: blob.pathname, size: blob.size };
}

async function main() {
  loadEnvFile();
  requiredEnv("BLOB_READ_WRITE_TOKEN");
  const { client, bucket } = r2Client();

  console.info("[blob-to-r2] Listing Vercel Blob objects...");
  const objects = (await Promise.all(PREFIXES.map(listAllBlobObjects))).flat().filter((blob) => blob.size > 0);
  const uniqueObjects = [...new Map(objects.map((blob) => [blob.pathname, blob])).values()].sort((a, b) => a.pathname.localeCompare(b.pathname));

  const summary = {
    totalFiles: uniqueObjects.length,
    copied: 0,
    verifiedExisting: 0,
    succeeded: 0,
    failed: 0,
    failures: [],
  };

  for (const [index, blob] of uniqueObjects.entries()) {
    const label = `${index + 1}/${uniqueObjects.length}`;

    try {
      const result = await copyOne(client, bucket, blob);
      if (result.status === "copied") summary.copied += 1;
      if (result.status === "verified-existing") summary.verifiedExisting += 1;
      summary.succeeded += 1;
      console.info(`[blob-to-r2] ${label} ${result.status}: ${result.key} (${result.size} bytes)`);
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        key: blob.pathname,
        size: blob.size,
        message: error instanceof Error ? error.message : String(error),
      });
      console.error(`[blob-to-r2] ${label} failed: ${blob.pathname} - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.info("[blob-to-r2] Migration summary");
  console.info(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[blob-to-r2] Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
