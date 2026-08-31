import { type NextRequest, NextResponse } from "next/server";

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

  // Client-safe configuration
  const config = {
    siteId,
    ...(merchantId ? { merchantId } : {}),
    enabled: true,
    posthogApiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || "phc_fIKSiffTRgwauMers7ntbnaJR3TsOw3xmnxvE26ZTYH",
    posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
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
