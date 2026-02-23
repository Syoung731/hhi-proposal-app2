import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.R2_ENDPOINT ?? process.env.AWS_S3_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET ?? process.env.S3_BUCKET ?? "";
const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL ?? process.env.S3_PUBLIC_BASE_URL ?? "";

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
