"use client";
import { useState } from "react";
import { request } from "@/lib/client";
export function FileUpload({
  outletId,
  purpose,
  value,
  onChange,
  onBusy,
}: {
  outletId: string;
  purpose: "MENU" | "STAFF_PHOTO" | "STAFF_DOCUMENT" | "RECEIPT_LOGO";
  value: string;
  onChange: (value: string) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const label =
    purpose === "RECEIPT_LOGO" ? "Bill logo" : purpose === "MENU"
      ? "Upload image"
      : purpose === "STAFF_PHOTO"
        ? "Staff photo"
        : "Government document";
  return (
    <div className="field file-upload">
      <label>
        {label}
        <input
          type="file"
          accept={
            purpose === "STAFF_DOCUMENT"
              ? "image/jpeg,image/png,image/webp,application/pdf"
              : "image/jpeg,image/png,image/webp"
          }
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setError("");
            setBusy(true);
            onBusy?.(true);
            try {
              if (file.size > 3500000)
                throw new Error("Use a file under 3.5 MB.");
              const saved = await request(
                `/api/uploads?outlet=${outletId}&purpose=${purpose}`,
                {
                  method: "POST",
                  body: file,
                  headers: { "Content-Type": file.type },
                },
              );
              onChange(purpose === "MENU" ? saved.url : saved.id);
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
              onBusy?.(false);
              event.target.value = "";
            }
          }}
        />
      </label>
      {busy && <span role="status">Uploading…</span>}
      {value && (
        <div className="inline-actions">
          {purpose === "RECEIPT_LOGO" ? (
            <a className="text-button" href={"/api/receipt-images/" + value} target="_blank" rel="noreferrer">View logo</a>
          ) : purpose !== "MENU" ? (
            <a
              className="text-button"
              href={"/api/staff-files/" + value}
              target="_blank"
              rel="noreferrer"
            >
              View file
            </a>
          ) : (
            <span>Image ready</span>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => onChange("")}
          >
            Remove
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
