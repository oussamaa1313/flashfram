
import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";

export const runtime = "nodejs";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export async function GET(request, context) {
  try {
    const { filename } = await context.params;
    const { searchParams } = new URL(request.url);

    const expires = searchParams.get("expires");
    const signature = searchParams.get("signature");
    const secret = process.env.DOWNLOAD_SECRET;

    if (
      !secret ||
      !/^[a-f0-9-]{36}\.mp4$/i.test(filename) ||
      !expires ||
      !/^\d+$/.test(expires) ||
      !signature ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      return NextResponse.json(
        { error: "Invalid download link" },
        { status: 403 }
      );
    }

    if (Number(expires) < Math.floor(Date.now() / 1000)) {
      return NextResponse.json(
        { error: "Download link expired" },
        { status: 403 }
      );
    }

    const expected = createHmac("sha256", secret)
      .update(`${filename}:${expires}`)
      .digest("hex");

    const valid = timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 403 }
      );
    }

    const result = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: `processed/${filename}`,
      })
    );

    if (!result.Body) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    return new Response(
      Readable.toWeb(result.Body),
      {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("Download error:", error);

    return NextResponse.json(
      { error: "Download failed" },
      { status: 404 }
    );
  }
}
