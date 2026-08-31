import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID!;
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function getBucket() {
  return process.env.R2_BUCKET_NAME!;
}

/**
 * Generate presigned URL untuk upload langsung dari browser ke R2.
 * Expire dalam 30 menit — cukup untuk upload video besar.
 */
export async function getPresignedUploadUrl(key: string, contentType: string = "video/mp4") {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: 1800 });
}

/**
 * Generate presigned URL untuk download file dari R2.
 * Expire dalam 1 jam.
 */
export async function getPresignedDownloadUrl(key: string) {
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}
