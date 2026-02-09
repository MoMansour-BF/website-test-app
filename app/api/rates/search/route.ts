import { NextRequest } from "next/server";

/**
 * POST /api/rates/search
 *
 * Uses the non-stream search implementation. Streaming (Phase 5) was deprecated;
 * the stream handler is kept in _deprecated/route.stream.ts for future use.
 * See docs/deprecated/STREAM_SEARCH_README.md and
 * docs/IMPLEMENTATION_PLAN_SEARCH_SPEED_AND_STREAM.md.
 */
export async function POST(req: NextRequest) {
  const { POST: nonStreamPost } = await import("./route.non-stream.backup");
  return nonStreamPost(req);
}
