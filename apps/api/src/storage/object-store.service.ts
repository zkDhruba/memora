import { Injectable } from "@nestjs/common";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

const PRESIGN_TTL_SEC = 10 * 60;

async function streamToBuffer(
  body: AsyncIterable<Uint8Array> | undefined,
): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class ObjectStoreService {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.s3.region(),
      endpoint: env.s3.endpoint(),
      forcePathStyle: env.s3.forcePathStyle(),
      credentials: {
        accessKeyId: env.s3.accessKey(),
        secretAccessKey: env.s3.secretKey(),
      },
    });
  }

  quarantineBucket(): string {
    return env.s3.quarantineBucket();
  }

  cleanBucket(): string {
    return env.s3.cleanBucket();
  }

  /**
   * Presigned PUT for quarantine. Content-Type and Content-Length must match
   * what the browser sends.
   */
  async presignPutQuarantine(input: {
    objectKey: string;
    mediaType: string;
    byteSize: number;
  }): Promise<{ url: string; headers: Record<string, string>; expiresIn: number }> {
    const command = new PutObjectCommand({
      Bucket: this.quarantineBucket(),
      Key: input.objectKey,
      ContentType: input.mediaType,
      ContentLength: input.byteSize,
    });

    let url = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_TTL_SEC,
    });

    const internal = env.s3.endpoint().replace(/\/$/, "");
    const pub = env.s3.publicEndpoint().replace(/\/$/, "");
    if (internal !== pub) {
      url = url.replace(internal, pub);
    }

    return {
      url,
      headers: {
        "Content-Type": input.mediaType,
        "Content-Length": String(input.byteSize),
      },
      expiresIn: PRESIGN_TTL_SEC,
    };
  }

  async headQuarantineObject(objectKey: string): Promise<{
    contentLength: number | undefined;
    contentType: string | undefined;
  } | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.quarantineBucket(),
          Key: objectKey,
        }),
      );
      return {
        contentLength: out.ContentLength,
        contentType: out.ContentType,
      };
    } catch (err) {
      const name = (err as { name?: string }).name;
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (name === "NotFound" || name === "NoSuchKey" || status === 404) {
        return null;
      }
      throw err;
    }
  }

  async getQuarantineObject(objectKey: string): Promise<Buffer> {
    const out = await this.client.send(
      new GetObjectCommand({
        Bucket: this.quarantineBucket(),
        Key: objectKey,
      }),
    );
    return streamToBuffer(out.Body as AsyncIterable<Uint8Array> | undefined);
  }

  async deleteQuarantineObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.quarantineBucket(),
        Key: objectKey,
      }),
    );
  }

  async deleteCleanObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.cleanBucket(),
        Key: objectKey,
      }),
    );
  }

  /** Copy quarantine → clean (same key), then delete quarantine object. */
  async promoteQuarantineToClean(objectKey: string): Promise<{
    bucket: string;
    objectKey: string;
  }> {
    const clean = this.cleanBucket();
    const quarantine = this.quarantineBucket();
    await this.client.send(
      new CopyObjectCommand({
        Bucket: clean,
        Key: objectKey,
        CopySource: `${quarantine}/${objectKey}`,
      }),
    );
    await this.deleteQuarantineObject(objectKey);
    return { bucket: clean, objectKey };
  }

  async getCleanObject(objectKey: string): Promise<Buffer> {
    const out = await this.client.send(
      new GetObjectCommand({
        Bucket: this.cleanBucket(),
        Key: objectKey,
      }),
    );
    return streamToBuffer(out.Body as AsyncIterable<Uint8Array> | undefined);
  }

  /** Store derived text (large parsed bodies) in the clean bucket. */
  async putCleanObject(input: {
    objectKey: string;
    body: Buffer | string;
    mediaType?: string;
  }): Promise<void> {
    const body =
      typeof input.body === "string"
        ? Buffer.from(input.body, "utf8")
        : input.body;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cleanBucket(),
        Key: input.objectKey,
        Body: body,
        ContentType: input.mediaType ?? "text/plain; charset=utf-8",
        ContentLength: body.length,
      }),
    );
  }
}
