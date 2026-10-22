"use client";
import { T } from "@/lib/staff-language";
import { useState } from "react";
import { businessDate } from "@dinerdost/core";
import { Badge, DataTable, Icon } from "@/components/ui";
import { date, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { IntegrationRequirementsButton } from "./integration-requirements";

export function Attendance() {
  const { data, form, run, modal } = useDesk();
  const [day, setDay] = useState(businessDate());
  const shifts: Row[] = data.shifts ?? [];
  const editShift = (shift?: Row) =>
    form(
      shift ? "Edit shift" : "Add shift",
      [
        { name: "name", label: "Shift name", value: shift?.name },
        {
          name: "start",
          label: "Starts (IST)",
          type: "time",
          value: shift?.starts_local?.slice(0, 5) ?? "09:00",
        },
        {
          name: "end",
          label: "Ends (IST)",
          type: "time",
          value: shift?.ends_local?.slice(0, 5) ?? "17:00",
        },
        {
          name: "active",
          label: "Active",
          type: "checkbox",
          value: shift?.active ?? true,
        },
      ],
      (values) =>
        run("shift", {
          ...values,
          outletId: data.outletId,
          ...(shift ? { id: shift.id, version: shift.version } : {}),
        }),
    );
  const mark = () =>
    form(
      "Record attendance",
      [
        {
          name: "employeeId",
          label: "Employee",
          type: "select",
          options: (data.assignmentEmployees ?? []).map((employee: Row) => ({
            value: employee.id,
            label: employee.name,
          })),
        },
        {
          name: "shiftId",
          label: "Shift",
          type: "select",
          options: shifts
            .filter((shift) => shift.active)
            .map((shift) => ({ value: shift.id, label: shift.name })),
        },
        { name: "date", label: "Date (IST)", type: "date", value: day },
        {
          name: "mode",
          label: "Attendance",
          type: "select",
          value: "CHECK_IN",
          options: [
            { value: "CHECK_IN", label: "Check in now" },
            { value: "ABSENT", label: "Absent" },
            { value: "LEAVE", label: "On leave" },
          ],
        },
        { name: "note", label: "Note", required: false },
      ],
      (values) => run("attendance", { ...values, outletId: data.outletId }),
    );
  return (
    <section className="panel">
      <div className="panel-heading attendance-toolbar">
        <input
          aria-label="Attendance date"
          type="date"
          value={day}
          max={businessDate()}
          onChange={(event) => setDay(event.target.value)}
        />
        <IntegrationRequirementsButton kind="fingerprint" />
        <button
          className="button"
          onClick={() =>
            modal(
              "Shifts",
              <div className="category-manager">
                <button className="button primary" onClick={() => editShift()}>
                  <Icon name="plus" />
                  Add shift
                </button>
                {shifts.map((shift) => (
                  <div className="category-manager-row" key={shift.id}>
                    <strong>
                      {shift.name}
                      <small>
                        {shift.starts_local.slice(0, 5)} –{" "}
                        {shift.ends_local.slice(0, 5)} IST
                      </small>
                    </strong>
                    <Badge value={shift.active ? "ACTIVE" : "PAUSED"} />
                    <button
                      className="button small"
                      aria-label={"Edit shift " + shift.name}
                      onClick={() => editShift(shift)}
                    >
                      <T>{"Edit"}</T>
                    </button>
                  </div>
                ))}
              </div>,
            )
          }
        >
          Shifts
        </button>
        <button
          className="button primary"
          disabled={
            !shifts.some((shift) => shift.active) ||
            !data.assignmentEmployees?.length
          }
          onClick={mark}
        >
          Record attendance
        </button>
      </div>
      <DataTable
        headers={[
          "Employee",
          "Shift",
          "Attendance",
          "Check in",
          "Check out",
          "Method",
          "",
        ]}
        rows={(data.attendance ?? [])
          .filter(
            (entry: Row) => String(entry.business_date).slice(0, 10) === day,
          )
          .map((entry: Row) => [
            <strong>{entry.employee_name}</strong>,
            entry.shift_name,
            <Badge value={entry.state} />,
            entry.checked_in_at ? date(entry.checked_in_at) : "—",
            entry.checked_out_at ? date(entry.checked_out_at) : "—",
            "Manager recorded",
            entry.state === "PRESENT" && !entry.checked_out_at ? (
              <button
                className="button small"
                onClick={() =>
                  void run("attendance", {
                    outletId: data.outletId,
                    employeeId: entry.employee_id,
                    shiftId: entry.shift_id,
                    date: day,
                    mode: "CHECK_OUT",
                    version: entry.version,
                  }).catch(() => {})
                }
              >
                Check out
              </button>
            ) : null,
          ])}
        empty={
          shifts.length
            ? "No attendance recorded for this day."
            : "Add a shift to start recording attendance."
        }
      />
    </section>
  );
}
