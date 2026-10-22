"use client";
import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import type { Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
export function ReceiptSettings({ outlet }: { outlet: Row }) {
  const { run, close, busy } = useDesk(),
    saved = outlet.receipt_settings ?? {},
    [logoId, setLogoId] = useState(saved.logoId ?? ""),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const fields = new FormData(event.currentTarget);
        try {
          await run("receiptSettings", {
            outletId: outlet.id,
            version: outlet.version,
            settings: {
              logoId: logoId || null,
              phone: fields.get("phone"),
              fssai: fields.get("fssai"),
              email: fields.get("email"),
              footer: fields.get("footer"),
              deliveryText: fields.get("deliveryText"),
            },
          });
          close();
        } catch (error) {
          setError((error as Error).message);
        }
      }}
    >
      <FileUpload
        outletId={outlet.id}
        purpose="RECEIPT_LOGO"
        value={logoId}
        onChange={setLogoId}
        onBusy={setUploading}
      />
      {[
        ["phone", "Business phone", "tel", 30],
        ["fssai", "FSSAI licence no.", "text", 32],
        ["email", "Feedback email", "email", 120],
      ].map(([name, label, type, max]) => (
        <label className="field" key={name}>
          {" "}
          {label}
          <input
            name={String(name)}
            type={String(type)}
            maxLength={Number(max)}
            defaultValue={saved[String(name)] ?? ""}
          />
        </label>
      ))}
      <label className="field">
        Thank-you message
        <textarea
          name="footer"
          aria-label="Thank-you message"
          maxLength={400}
          defaultValue={saved.footer ?? "Thank You, Visit Again!!!"}
        />
      </label>
      <label className="field">
        Delivery footer
        <input
          name="deliveryText"
          maxLength={160}
          placeholder="Optional"
          defaultValue={saved.deliveryText ?? ""}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className="button primary full-width"
        disabled={busy || uploading}
      >
        Save bill details
      </button>
    </form>
  );
}
