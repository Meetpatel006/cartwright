import { auth } from "@cartwright/auth";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  // Read the request URL up-front: under Cache Components this stops prerender
  // attempts, keeping this session-gated + filesystem handler request-time.
  const { pathname } = new URL(request.url);
  void pathname;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cwd = process.cwd();
    const candidateDirs = [
      path.resolve(cwd, "packages/agent/recordings"),
      path.resolve(cwd, "../../packages/agent/recordings"),
      path.resolve(cwd, "../agent/recordings"),
    ];

    let recordingsDir: string | null = null;
    for (const dir of candidateDirs) {
      if (fs.existsSync(/*turbopackIgnore: true*/ dir)) {
        recordingsDir = dir;
        break;
      }
    }

    if (!recordingsDir) {
      return NextResponse.json({ recordings: [] });
    }

    const files = fs
      .readdirSync(/*turbopackIgnore: true*/ recordingsDir)
      .filter((file) => file.endsWith(".mp4") || file.endsWith(".webm"))
      .sort()
      .reverse();

    return NextResponse.json({ recordings: files });
  } catch (error) {
    console.error("Failed to list recordings:", error);
    return NextResponse.json({ recordings: [], error: "Failed to list recordings" }, { status: 500 });
  }
}
