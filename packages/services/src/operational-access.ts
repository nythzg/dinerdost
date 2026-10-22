import { ensure, operationalStream, type Actor } from "@dinerdost/core";

export function actorStream(actor: Actor) {
  return actor.role === "BARTENDER" ? "BAR" : actor.role === "KITCHEN" ? "FOOD" : operationalStream(actor.application);
}
export function requireInventoryStream(actor: Actor, category: string, actualStream?: string) {
  const stream = actorStream(actor);
  ensure(!stream || (actualStream ?? (category === "LIQUOR" ? "BAR" : "FOOD")) === stream,
    "STREAM_FORBIDDEN", "This stock belongs to another operational application.", 403);
}
export function requireTicketStream(actor: Actor, stream: string) {
  const permitted = actorStream(actor);
  ensure(!permitted || stream === permitted, "STREAM_FORBIDDEN", "This ticket belongs to another kitchen stream.", 403);
}
