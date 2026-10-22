"use client";
import { isManager } from "@dinerdost/core";
import type { Row } from "@/lib/client";
import { useDesk } from "../workspace/context";

export function ActivationSwitch() {
  const { data, run, busy, notify } = useDesk();
  const outlet = data.outlets.find((o: Row) => o.id === data.outletId);
  if (!isManager(data.actor)) return null;
  return (
    <div className="qr-ordering-control activation-control">
      <span>
        Auto activation{" "}
        <small>{outlet.qr_auto_activate ? "ON" : "OFF · Staff approval"}</small>
      </span>
      <button
        type="button"
        role="switch"
        className="qr-ordering-switch"
        aria-label="Auto activation of tables"
        aria-checked={!!outlet.qr_auto_activate}
        disabled={busy}
        onClick={() =>
          void run("qrPolicy", {
            outletId: outlet.id,
            version: outlet.version,
            enabled: outlet.qr_enabled,
            autoActivate: !outlet.qr_auto_activate,
          })
            .then(() =>
              notify(
                outlet.qr_auto_activate
                  ? "Staff approval enabled for new visits."
                  : "Automatic activation enabled for new scans.",
              ),
            )
            .catch(() => {})
        }
      >
        <span />
      </button>
    </div>
  );
}
