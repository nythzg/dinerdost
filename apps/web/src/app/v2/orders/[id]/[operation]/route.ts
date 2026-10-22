import { NextRequest } from "next/server";
import { z } from "zod";
import { versionedCommand } from "@/lib/versioned-command";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; operation: string }> }) {
  const { id, operation } = await params;
  return versionedCommand(request, input => {
    const orderId = z.uuid().parse(id);
    const name = z.enum(["rounds", "identity-gate", "provisional-bill", "settle"]).parse(operation);
    if (name === "rounds") return { action: "createRound", input: { ...input, orderId } };
    if (name === "identity-gate") {
      const { roundId, ...identity } = input;
      return { action: "identity", orderId, roundId: z.uuid().parse(roundId), input: identity };
    }
    z.object({}).strict().parse(input);
    return { action: "bill", orderId, input: { final: name === "settle" } };
  });
}
