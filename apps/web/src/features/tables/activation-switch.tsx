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
      <span>QR auto activation</span>
      <button
        type="button"
        role="switch"
        className="feature-switch"
        aria-label="QR auto activation"
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
        <span>{outlet.qr_auto_activate ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
