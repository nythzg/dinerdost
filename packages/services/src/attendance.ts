import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  businessDate,
  ensure,
  requireOutlet,
  requirePermission,
  type Actor,
  can,
} from "@dinerdost/core";
import { audit, command, expectedVersion, id, one, type Row } from "./shared";

export async function saveShift(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "attendance");
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
  const data = z
    .object({
      id: z.uuid().optional(),
      version: z.number().int().optional(),
      outletId: z.uuid(),
      name: z.string().trim().min(1).max(80),
      start: time,
      end: time,
      active: z.boolean().default(true),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  ensure(
    data.start !== data.end,
    "INVALID_SHIFT",
    "Shift start and end must be different.",
  );
  return command(db, actor, key, "SHIFT_SAVED", data, async (tx) => {
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR UPDATE", [
      data.outletId,
    ]);
    const previous = data.id
      ? await one(
          tx,
          "SELECT * FROM employee_shifts WHERE id=$1 AND outlet_id=$2 FOR UPDATE",
          [data.id, data.outletId],
        )
      : null;
    if (previous) expectedVersion(previous.version, data.version ?? 0);
    ensure(
      !(
        await tx.query(
          "SELECT id FROM employee_shifts WHERE outlet_id=$1 AND lower(name)=lower($2) AND ($3::uuid IS NULL OR id<>$3)",
          [data.outletId, data.name, data.id ?? null],
        )
      ).rows.length,
      "SHIFT_EXISTS",
      "A shift with this name already exists.",
      409,
    );
    const shiftId = data.id ?? id();
    if (previous)
      await tx.query(
        "UPDATE employee_shifts SET name=$2,starts_local=$3,ends_local=$4,active=$5,version=version+1 WHERE id=$1",
        [shiftId, data.name, data.start, data.end, data.active],
      );
    else
      await tx.query(
        "INSERT INTO employee_shifts(id,restro_id,outlet_id,name,starts_local,ends_local,active) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          shiftId,
          actor.restroId,
          data.outletId,
          data.name,
          data.start,
          data.end,
          data.active,
        ],
      );
    await audit(tx, actor, {
      action: "SHIFT_SAVED",
      entityType: "EMPLOYEE_SHIFT",
      entityId: shiftId,
      outletId: data.outletId,
      oldState: previous,
      newState: data,
    });
    return { id: shiftId };
  });
}

export async function markAttendance(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  if (!can(actor, "ownAttendance")) requirePermission(actor, "attendance");
  const data = z
    .object({
      outletId: z.uuid(),
      employeeId: z.uuid(),
      shiftId: z.uuid(),
      date: z.iso.date(),
      mode: z.enum(["CHECK_IN", "CHECK_OUT", "ABSENT", "LEAVE"]),
      version: z.number().int().optional(),
      note: z.string().trim().max(500).default(""),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  if (can(actor, "ownAttendance")) ensure(data.employeeId === actor.employeeId && data.date === businessDate() && ["CHECK_IN", "CHECK_OUT"].includes(data.mode),
    "FORBIDDEN", "You can check only yourself in or out on the current business day.", 403);
  ensure(
    data.date <= businessDate(),
    "FUTURE_ATTENDANCE",
    "Attendance cannot be recorded for a future day.",
  );
  if (data.mode === "CHECK_IN")
    ensure(
      data.date === businessDate(),
      "CHECK_IN_DATE",
      "Check in on the current business day.",
    );
  return command(db, actor, key, "ATTENDANCE_RECORDED", data, async (tx) => {
    const employee = await one(
      tx,
      "SELECT * FROM employees WHERE id=$1 AND active=true FOR UPDATE",
      [data.employeeId],
    );
    ensure(
      employee.role === "OWNER" || employee.outlet_ids.includes(data.outletId),
      "OUTLET_FORBIDDEN",
      "This employee is not assigned to the outlet.",
      403,
    );
    const shift = await one(
      tx,
      "SELECT id,active FROM employee_shifts WHERE id=$1 AND outlet_id=$2",
      [data.shiftId, data.outletId],
    );
    ensure(
      shift.active || data.mode === "CHECK_OUT",
      "SHIFT_INACTIVE",
      "Choose an active shift for new attendance.",
      409,
    );
    const previous: Row | undefined = (
      await tx.query<Row>(
        "SELECT * FROM employee_attendance WHERE employee_id=$1 AND shift_id=$2 AND business_date=$3 FOR UPDATE",
        [data.employeeId, data.shiftId, data.date],
      )
    ).rows[0];
    if (previous) expectedVersion(previous.version, data.version ?? 0);
    const attendanceId = previous?.id ?? id();
    if (data.mode === "CHECK_OUT") {
      ensure(
        previous?.state === "PRESENT" &&
          previous.checked_in_at &&
          !previous.checked_out_at,
        "CHECK_IN_REQUIRED",
        "An open check-in is required before checking out.",
        409,
      );
      await tx.query(
        "UPDATE employee_attendance SET checked_out_at=now(),note=$2,recorded_by=$3,version=version+1 WHERE id=$1",
        [attendanceId, data.note, actor.employeeId],
      );
    } else {
      ensure(
        !previous?.checked_in_at,
        "ATTENDANCE_LOCKED",
        "This shift already has a check-in. Use Check out to finish it.",
        409,
      );
      const state = data.mode === "CHECK_IN" ? "PRESENT" : data.mode;
      if (previous)
        await tx.query(
          "UPDATE employee_attendance SET state=$2,checked_in_at=CASE WHEN $2='PRESENT' THEN now() ELSE NULL END,note=$3,recorded_by=$4,version=version+1 WHERE id=$1",
          [attendanceId, state, data.note, actor.employeeId],
        );
      else
        await tx.query(
          "INSERT INTO employee_attendance(id,restro_id,outlet_id,employee_id,shift_id,business_date,state,checked_in_at,note,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7='PRESENT' THEN now() ELSE NULL END,$8,$9)",
          [
            attendanceId,
            actor.restroId,
            data.outletId,
            data.employeeId,
            data.shiftId,
            data.date,
            state,
            data.note,
            actor.employeeId,
          ],
        );
    }
    await audit(tx, actor, {
      action: "ATTENDANCE_" + data.mode,
      entityType: "EMPLOYEE_ATTENDANCE",
      entityId: attendanceId,
      outletId: data.outletId,
      oldState: previous,
      newState: { ...data, source: "MANUAL" },
      reason: data.note || "Recorded by authorized manager",
    });
    return { id: attendanceId };
  });
}
