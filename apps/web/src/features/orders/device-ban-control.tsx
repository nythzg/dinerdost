"use client";
import { useEffect } from "react";
import { can } from "@dinerdost/core";
import { date, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";

export function DeviceBanControl({
  access,
  change,
  refresh,
}: {
  access: Row | null;
  change: (input: Row) => Promise<unknown>;
  refresh: () => Promise<void>;
}) {
  const { data, form } = useDesk();
  useEffect(() => {
    if (!access?.blocked || !access.banned_until) return;
    const timer = setTimeout(
      () => void refresh(),
      Math.max(
        1000,
        new Date(access.banned_until).getTime() - Date.now() + 250,
      ),
    );
    return () => clearTimeout(timer);
  }, [access?.blocked, access?.banned_until, refresh]);
  if (!access || !can(data.actor.role, "security")) return null;
  const blocked = access.blocked;
  return (
    <div className="device-control">
      {blocked && (
        <small title={access.ban_reason}>
          Device blocked until {date(access.banned_until)}
        </small>
      )}
      <button
        className={"button small " + (blocked ? "" : "danger-text")}
        onClick={() =>
          form(
            blocked ? "Lift device ban" : "Temporarily ban device",
            [
              ...(!blocked
                ? [
                    {
                      name: "minutes",
                      label: "Duration",
                      type: "select",
                      value: "60",
                      options: [
                        { value: "15", label: "15 minutes" },
                        { value: "60", label: "1 hour" },
                        { value: "240", label: "4 hours" },
                        { value: "1440", label: "24 hours" },
                      ],
                      help: "Applies to this browser at this outlet.",
                    },
                  ]
                : []),
              {
                name: "reason",
                label: "Reason",
                type: "textarea",
                value: blocked ? "Ban lifted by manager" : "",
              },
            ],
            (values) =>
              change({
                ...values,
                mode: blocked ? "LIFT" : "BAN",
                version: access.version,
              }),
            blocked ? "Lift ban" : "Ban device",
          )
        }
      >
        {blocked ? "Lift ban" : "Ban device"}
      </button>
    </div>
  );
}
