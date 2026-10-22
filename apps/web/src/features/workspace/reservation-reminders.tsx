"use client";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { date, type Row } from "@/lib/client";
import { useDesk } from "./context";

export function ReservationReminders() {
  const { data, go } = useDesk();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const key = (notice: Row) =>
    "dd-reservation-" +
    data.outletId +
    "-" +
    notice.id +
    "-" +
    notice.starts_at;
  const notices = (data.reservationNotices ?? []).filter(
    (notice: Row) =>
      !dismissed.includes(key(notice)) &&
      (typeof window === "undefined" ||
        sessionStorage.getItem(key(notice)) !== "seen"),
  );
  if (!notices.length) return null;
  const dismiss = (notice: Row) => {
    sessionStorage.setItem(key(notice), "seen");
    setDismissed((previous) => [...previous, key(notice)]);
  };
  return (
    <aside className="reservation-reminders" aria-label="Reservation reminders">
      {notices.map((notice: Row) => (
        <div className="reservation-reminder" key={key(notice)} role="alert">
          <Icon name="clock" />
          <div>
            <strong>{notice.table_label} is still occupied</strong>
            <span>
              {notice.guest} · {date(notice.starts_at)}
            </span>
            <button
              className="text-button"
              onClick={() => {
                dismiss(notice);
                go("/app/reservations");
              }}
            >
              View reservation
            </button>
          </div>
          <button
            className="icon-button"
            aria-label={
              "Dismiss reservation reminder for " + notice.table_label
            }
            onClick={() => dismiss(notice)}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
    </aside>
  );
}
