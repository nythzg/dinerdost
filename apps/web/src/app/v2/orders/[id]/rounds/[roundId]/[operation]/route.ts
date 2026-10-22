import { NextRequest } from "next/server";
import { z } from "zod";
import { versionedCommand } from "@/lib/versioned-command";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; roundId: string; operation: string }> }) {
  const ids = await params;
  return versionedCommand(request, input => {
    const orderId = z.uuid().parse(ids.id), roundId = z.uuid().parse(ids.roundId);
    const operation = z.enum(["edit", "accept", "reject", "payment", "serve", "review-rewards"]).parse(ids.operation);
    if (operation === "serve" || operation === "review-rewards") z.object({}).strict().parse(input);
    const action = { edit: "editRound", accept: "decideRound", reject: "decideRound", payment: "recordPayment", serve: "serve", "review-rewards": "reviewRewards" }[operation];
    return { action, orderId, roundId, input: ["accept", "reject"].includes(operation) ? { ...input, decision: operation.toUpperCase() } : input };
  });
}
