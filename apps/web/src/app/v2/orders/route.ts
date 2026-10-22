import { NextRequest } from "next/server";
import { versionedCommand } from "@/lib/versioned-command";
export async function POST(request: NextRequest) {
  return versionedCommand(request, input => ({ action: "createRound", input }));
}
