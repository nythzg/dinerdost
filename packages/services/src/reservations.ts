import type { Sql } from "@dinerdost/database";
import { ensure } from "@dinerdost/core";
import { one, type Row } from "./shared";

export async function holdReservation(
  tx: Sql,
  recordId: string,
  restroId: string,
  outletId: string,
  values: Row,
) {
  const table = await one(
    tx,
    "SELECT * FROM dining_tables WHERE id=$1 AND outlet_id=$2 AND retired_at IS NULL FOR UPDATE",
    [values.tableId, outletId],
  );
  ensure(
    values.guests <= table.seats,
    "TABLE_CAPACITY",
    "Choose a table with enough seats for this reservation.",
  );
  ensure(
    new Date(values.at).getTime() > Date.now(),
    "RESERVATION_IN_PAST",
    "Choose a future reservation time.",
  );
  const endsAt = new Date(
    new Date(values.at).getTime() + values.durationMinutes * 60000,
  ).toISOString();
  const overlap = (
    await tx.query(
      "SELECT id FROM table_reservations WHERE table_id=$1 AND id<>$2 AND state IN ('HELD','SEATED') AND starts_at<$4 AND ends_at>$3",
      [table.id, recordId, values.at, endsAt],
    )
  ).rows;
  ensure(
    !overlap.length,
    "TABLE_ALREADY_RESERVED",
    "This table is already reserved during that time. Choose another table or time.",
    409,
  );
  await tx.query(
    "INSERT INTO table_reservations(id,restro_id,outlet_id,table_id,starts_at,ends_at,guests) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET table_id=$4,starts_at=$5,ends_at=$6,guests=$7",
    [recordId, restroId, outletId, table.id, values.at, endsAt, values.guests],
  );
}

export async function assertTableNotReserved(
  tx: Sql,
  tableId: string,
  reservationId?: string,
) {
  const due = (
    await tx.query<Row>(
      "SELECT id FROM table_reservations WHERE table_id=$1 AND state='HELD' AND starts_at<=now() AND ends_at>now() AND ($2::uuid IS NULL OR id<>$2)",
      [tableId, reservationId ?? null],
    )
  ).rows;
  ensure(
    !due.length,
    "TABLE_RESERVED",
    "This table is reserved now. Seat the reserved guest or choose another table.",
    409,
  );
}

export async function reservationReadModel(tx: Sql, outletId: string) {
  return (
    await tx.query<Row>(
      "SELECT b.*,t.label AS table_label,r.data->>'guest' AS guest FROM table_reservations b JOIN records r ON r.id=b.id AND r.restro_id=b.restro_id JOIN dining_tables t ON t.id=b.table_id AND t.restro_id=b.restro_id WHERE b.outlet_id=$1 AND b.state IN ('HELD','SEATED') AND b.ends_at>now() ORDER BY b.starts_at",
      [outletId],
    )
  ).rows;
}
