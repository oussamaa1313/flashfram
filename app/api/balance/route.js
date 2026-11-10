
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

export const runtime = "nodejs";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export async function GET(request) {
  try {
    const required = [
      "STRIPE_SECRET_KEY",
      "R2_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
    ];

    for (const key of required) {
      if (!process.env[key]) {
        return NextResponse.json(
          { error: `Missing environment variable: ${key}` },
          { status: 500 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (
      !sessionId ||
      !/^cs_(test|live)_/.test(sessionId)
    ) {
      return NextResponse.json(
        { error: "Invalid Stripe session." },
        { status: 400 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.retrieve(
      sessionId
    );

    if (
      session.payment_status !== "paid" ||
      session.amount_total !== 1000 ||
      session.currency !== "usd"
    ) {
      return NextResponse.json(
        { error: "Payment not verified." },
        { status: 402 }
      );
    }

    const paymentHash = createHash("sha256")
      .update(sessionId)
      .digest("hex");

    const usageKey = `payment-usage/${paymentHash}.json`;

    let used = 0;

    try {
      const result = await r2.send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: usageKey,
        })
      );

      const data = JSON.parse(
        await result.Body.transformToString()
      );

      if (
        !Number.isInteger(data.used) ||
        data.used < 0 ||
        data.used > 3
      ) {
        throw new Error("Invalid package balance.");
      }

      used = data.used;

    } catch (error) {
      if (
        error.name !== "NoSuchKey" &&
        error.$metadata?.httpStatusCode !== 404
      ) {
        throw error;
      }
    }

    return NextResponse.json({
      success: true,
      used,
      remaining: 3 - used,
      completed: used === 3,
    });

  } catch (error) {
    console.error("Balance API error:", error);

    return NextResponse.json(
      { error: "Could not retrieve package balance." },
      { status: 500 }
    );
  }
}
