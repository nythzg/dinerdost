import {observePlatformRoute} from '@/lib/platform-local-runtime';
import { NextRequest } from "next/server";
import { workspace } from "@dinerdost/services";
import { z } from "zod";
import { context, failure, response } from "@/lib/server";
export const runtime = "nodejs";
async function handleGET(request: NextRequest) {
  try {
    const { db, actor } = await context();
    const outlet = z
      .uuid()
      .optional()
      .parse(request.nextUrl.searchParams.get("outlet") ?? undefined);
    return response(await workspace(db, actor, outlet));
  } catch (error) {
    return failure(error);
  }
}

export const GET=observePlatformRoute('/api/workspace',handleGET);
