import { Injectable } from "@nestjs/common";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

const PRESIGN_TTL_SEC = 10 * 60;

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

    // Rewrite host for browser if public endpoint differs (rare locally).
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
}
