import "server-only";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { extensionForContentType, sanitizeFileStem } from "@/lib/storage";
import type { BlobDescriptor } from "@/lib/types";

type R2Kind = "book" | "cover";

type R2Config = {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicBaseUrl?: string;
};

type R2Object = {
  body: BodyInit;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
  acceptRanges?: string;
  etag?: string;
  lastModified?: Date;
};

const R2_REQUIRED_ENV = ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const;
const BOOK_CONTENT_TYPES = new Set(["application/pdf", "application/epub+zip", "application/octet-stream"]);
const COVER_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_BOOK_SIZE = 500 * 1024 * 1024;
const MAX_COVER_SIZE = 12 * 1024 * 1024;

let cachedClient: S3Client | null = null;
let cachedConfigKey = "";

function envValue(name: string) {
  return process.env[name]?.trim() || "";
}

export function r2MissingEnv() {
  return R2_REQUIRED_ENV.filter((name) => !envValue(name));
}

export function r2Configured() {
  return r2MissingEnv().length === 0;
}

export function r2ConfigError() {
  const missing = r2MissingEnv();
  if (missing.length === 0) return null;
  return `Cloudflare R2 is not configured. Missing environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`;
}

function r2Config(): R2Config {
  const error = r2ConfigError();
  if (error) throw new Error(error);

  const accountId = envValue("R2_ACCOUNT_ID");
  return {
    accountId,
    bucketName: envValue("R2_BUCKET_NAME"),
    accessKeyId: envValue("R2_ACCESS_KEY_ID"),
    secretAccessKey: envValue("R2_SECRET_ACCESS_KEY"),
    endpoint: envValue("R2_ENDPOINT") || `https://${accountId}.r2.cloudflarestorage.com`,
    publicBaseUrl: envValue("R2_PUBLIC_BASE_URL") || undefined,
  };
}

function r2Client() {
  const config = r2Config();
  const configKey = `${config.endpoint}:${config.accessKeyId}`;

  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
    cachedConfigKey = configKey;
  }

  return { client: cachedClient, config };
}

function streamBody(body: unknown) {
  if (!body) throw new Error("R2 object response did not include a body.");
  if (body instanceof ReadableStream) return body as unknown as BodyInit;
  if (body instanceof Readable) return Readable.toWeb(body) as unknown as BodyInit;
  if (typeof body === "object" && "transformToWebStream" in body && typeof body.transformToWebStream === "function") {
    return body.transformToWebStream() as BodyInit;
  }
  throw new Error("R2 object response body could not be streamed.");
}

function objectUrl(config: R2Config, key: string) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  return `r2://${config.bucketName}/${key}`;
}

function uploadKey(kind: R2Kind, file: File, slugHint: string) {
  const folder = kind === "book" ? "books" : "covers";
  const stem = sanitizeFileStem(slugHint || file.name.replace(/\.[^.]+$/, ""));
  const extension = extensionForContentType(file.type) || file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() || "";
  return `${folder}/${stem}-${Date.now()}${extension === ".jpeg" ? ".jpg" : extension}`;
}

export function validateR2Upload(file: File, kind: R2Kind) {
  if (!file.size) return "The uploaded file is empty.";

  const contentType = file.type || "application/octet-stream";
  if (kind === "book") {
    if (file.size > MAX_BOOK_SIZE) return "Book files must be 500 MB or smaller.";
    if (!BOOK_CONTENT_TYPES.has(contentType)) return "Book files must be PDF or EPUB.";
    return null;
  }

  if (file.size > MAX_COVER_SIZE) return "Cover images must be 12 MB or smaller.";
  if (!COVER_CONTENT_TYPES.has(contentType)) return "Cover image must be JPG, PNG, WEBP, or AVIF.";
  return null;
}

export async function uploadR2File(file: File, kind: R2Kind, slugHint: string): Promise<BlobDescriptor> {
  const validationError = validateR2Upload(file, kind);
  if (validationError) throw new Error(validationError);

  const { client, config } = r2Client();
  const key = uploadKey(kind, file, slugHint);
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: bytes,
      ContentLength: file.size,
      ContentType: contentType,
    }),
  );

  return {
    url: objectUrl(config, key),
    pathname: key,
    contentType,
    size: file.size,
  };
}

export async function getR2Object(key: string, range?: string | null): Promise<R2Object | null> {
  const { client, config } = r2Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Range: range || undefined,
      }),
    );

    return {
      body: streamBody(response.Body),
      contentType: response.ContentType || "application/octet-stream",
      contentLength: response.ContentLength,
      contentRange: response.ContentRange,
      acceptRanges: response.AcceptRanges,
      etag: response.ETag,
      lastModified: response.LastModified,
    };
  } catch (error) {
    const status = typeof error === "object" && error !== null && "$metadata" in error ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
    if (status === 404 || (error instanceof Error && error.name === "NoSuchKey")) return null;
    throw error;
  }
}

export async function deleteR2ObjectIfPresent(key: string | null | undefined) {
  if (!key || !r2Configured()) return;
  const { client, config } = r2Client();

  try {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
  } catch (error) {
    console.warn("[r2] delete failed", { key, message: error instanceof Error ? error.message : String(error) });
  }
}
