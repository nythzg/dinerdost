import type { Sql } from "@dinerdost/database";
import type { Row } from "./shared";
export async function refreshOrderStatus(tx: Sql, orderId: string) {
  const rounds = (
    await tx.query<Row>(
      "SELECT status,kot_status FROM order_rounds WHERE order_id=$1",
      [orderId],
    )
  ).rows;
  const accepted = rounds.filter((r) => r.status === "ACCEPTED");
  let state: string;
  if (rounds.some((r) => r.status === "PENDING")) state = "PENDING";
  else if (accepted.length) {
    if (accepted.every((r) => r.kot_status === "SERVED")) state = "SERVED";
    else if (accepted.every((r) => ["SERVED", "READY"].includes(r.kot_status)))
      state = "READY";
    else if (
      accepted.some((r) =>
        ["PREPARING", "READY", "SERVED"].includes(r.kot_status),
      )
    )
      state = "PREPARING";
    else state = "ACCEPTED";
  } else if (rounds.some((r) => r.status === "DRAFT")) state = "DRAFT";
  else
    state = rounds.some((r) => r.status === "REJECTED") ? "REJECTED" : "VOIDED";
  await tx.query(
    "UPDATE orders SET status=$2,version=version+1 WHERE id=$1 AND status<>'SETTLED'",
    [orderId, state],
  );
  return state;
}
