import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.R2_ENDPOINT ?? process.env.AWS_S3_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET ?? process.env.S3_BUCKET ?? "";
const publicBaseUrl =
  process.env.PUBLIC_MEDIA_BASE_URL ??
  process.env.R2_PUBLIC_BASE_URL ??
  process.env.S3_PUBLIC_BASE_URL ??
  "";

export function isStorageConfigured(): boolean {
  return !!(endpoint && accessKeyId && secretAccessKey && bucket);
}

function getClient(): S3Client {
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2/S3 storage is not configured");
  }
  return new S3Client({
    region: process.env.AWS_REGION ?? "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

/**
 * Generate a presigned URL for uploading a file. Caller must then PUT the file to the URL.
 * Returns { uploadUrl, fileKey, publicUrl }.
 */
export async function getPresignedUploadUrl(
  fileKey: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<{ uploadUrl: string; fileKey: string; publicUrl: string }> {
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: fileKey,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });
  const publicUrl = publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, "")}/${fileKey}` : uploadUrl;
  return { uploadUrl, fileKey, publicUrl };
}

/**
 * Upload a buffer directly to R2 (server-side). Returns the public URL for the stored object.
 */
export async function uploadBuffer(
  fileKey: string,
  body: Buffer,
  contentType: string
): Promise<{ fileKey: string; publicUrl: string }> {
  const client = getClient();
  if (!bucket) throw new Error("R2/S3 bucket is not configured");
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      Body: body,
      ContentType: contentType,
    })
  );
  const publicUrl = publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, "")}/${fileKey}` : "";
  return { fileKey, publicUrl };
}

const DELETE_BATCH_SIZE = 1000; // S3/R2 DeleteObjects limit per request

/**
 * Delete multiple objects from R2. All-or-nothing: if any delete fails, throws with details.
 * Use for project delete: delete all media fileKeys first; only then delete DB project.
 */
export async function deleteR2Objects(
  fileKeys: string[],
  context?: { projectId?: string }
): Promise<void> {
  if (fileKeys.length === 0) return;
  const client = getClient();
  for (let i = 0; i < fileKeys.length; i += DELETE_BATCH_SIZE) {
    const batch = fileKeys.slice(i, i + DELETE_BATCH_SIZE);
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: batch.map((Key) => ({ Key })),
        Quiet: false,
      },
    });
    const result = await client.send(command);
    const errors = result.Errors ?? [];
    if (errors.length > 0) {
      const detail = errors
        .map((e) => `key=${e.Key ?? "?"} code=${e.Code ?? "?"} message=${e.Message ?? "?"}`)
        .join("; ");
      const msg = `R2 delete failed (projectId=${context?.projectId ?? "n/a"}): ${detail}`;
      console.error(msg);
      throw new Error(`Failed to delete ${errors.length} object(s) from storage. ${detail}`);
    }
  }
}
