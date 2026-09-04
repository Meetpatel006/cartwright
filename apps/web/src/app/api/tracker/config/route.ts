import { type NextRequest, NextResponse } from "next/server";
import { env } from "@cartwright/env/server";

/**
 * Public Client-Safe Tracker Configuration Endpoint
 *
 * Exposes only public browser-safe configuration (PostHog project key, ingestion host,
 * and site enablement status). Never returns private keys or credentials.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("site");
  const merchantId = searchParams.get("merchant") || undefined;

  if (!siteId) {
    return NextResponse.json(
      { error: "Missing site query parameter" },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  }

  // Client-safe configuration — only the public PostHog project write key
  // (NEXT_PUBLIC_POSTHOG_KEY, starts with "phc_") is exposed here.
  // The POSTHOG_PERSONAL_API_KEY (starts with "phx_") is NEVER sent to the client.
  const posthogApiKey = env.POSTHOG_PROJECT_WRITE_KEY;
  const posthogHost = env.POSTHOG_INGESTION_HOST;

  if (!posthogApiKey || !posthogHost) {
    return NextResponse.json(
      { error: "Tracker not configured" },
      { status: 500 },
    );
  }

  const config = {
    siteId,
    ...(merchantId ? { merchantId } : {}),
    enabled: true,
    posthogApiKey,
    posthogHost,
    autocapture: true,
    respectDnt: true,
  };

  return NextResponse.json(config, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
