"use client";
import { useEffect, useState } from "react";
import { Form, type Field } from "@/components/ui";
import { FileUpload } from "@/components/file-upload";
import { request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { roleName } from "./team-access";
export function MemberEditor({ member }: { member?: Row }) {
  const { data, run, close, notify } = useDesk(),
    [loaded, setLoaded] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [uploads, setUploads] = useState(0),
    [error, setError] = useState(""),
    [photo, setPhoto] = useState(""),
    [document, setDocument] = useState(""),
    [documentType, setDocumentType] = useState("");
  useEffect(() => {
    if (member)
      void request("/api/staff/" + member.id)
        .then((value) => {
          setLoaded(value);
          setPhoto(value.photo_id ?? "");
          setDocument(value.document_id ?? "");
          setDocumentType(value.document_type ?? "");
        })
        .catch((error) => setError(error.message));
    else setLoaded({});
  }, [member?.id]);
  if (!loaded)
    return (
      <div className="form">
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : (
          <span role="status">Loading member…</span>
        )}
      </div>
    );
  const fields: Field[] = [
    { name: "name", label: "Full name", value: loaded.name ?? member?.name },
    ...(!member
      ? [
          { name: "email", label: "Sign-in email", type: "email" },
          {
            name: "password",
            label: "Initial password",
            type: "password",
            help: "At least 12 characters. Share it privately.",
          },
          {
            name: "role",
            label: "Role",
            type: "select",
            options: [
              "MANAGER",
              "CASHIER",
              "WAITER",
              "KITCHEN",
              "BARTENDER",
              "ACCOUNTANT",
            ].map((role) => ({ value: role, label: roleName(role) })),
          },
        ]
      : []),
    {
      name: "salary",
      label: "Monthly base salary (₹)",
      type: "number",
      min: 0,
      step: 0.01,
      value: Number(loaded.base_salary ?? 0) / 100,
    },
    {
      name: "phone",
      label: "Phone number",
      type: "tel",
      required: false,
      value: loaded.phone ?? "",
    },
    {
      name: "address",
      label: "Address",
      type: "textarea",
      required: false,
      value: loaded.address ?? "",
    },
    {
      name: "pincode",
      label: "Pincode",
      required: false,
      value: loaded.pincode ?? "",
    },
  ];
  return (
    <Form
      fields={fields}
      busy={busy || uploads > 0}
      onSubmit={async (values) => {
        setBusy(true);
        setError("");
        try {
          if (uploads) throw new Error("Wait for the files to upload.");
          const input = {
            name: values.name,
            salary: Math.round(values.salary * 100),
            details: {
              phone: values.phone.replace(/[\s()-]/g, ""),
              address: values.address,
              pincode: values.pincode,
              photoId: photo || null,
              documentId: document || null,
              documentType: document ? documentType : "",
            },
          };
          if (member)
            await run(
              "employeeProfile",
              { ...input, version: loaded.version },
              { id: member.id },
            );
          else
            await run("employee", {
              ...input,
              email: values.email,
              password: values.password,
              role: values.role,
              outletIds: [data.outletId],
            });
          close();
          notify(member ? "Member updated." : "Member added.");
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <FileUpload
        outletId={data.outletId}
        purpose="STAFF_PHOTO"
        onBusy={(value) => setUploads((count) => count + (value ? 1 : -1))}
        value={photo}
        onChange={setPhoto}
      />
      <label className="field">
        Document type
        <select
          aria-label="Document type"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value)}
          required={!!document}
        >
          <option value="">Choose…</option>
          <option value="AADHAAR">Aadhaar</option>
          <option value="PAN">PAN</option>
          <option value="VOTER_ID">Voter ID</option>
          <option value="DRIVING_LICENCE">Driving licence</option>
        </select>
      </label>
      <FileUpload
        outletId={data.outletId}
        purpose="STAFF_DOCUMENT"
        onBusy={(value) => setUploads((count) => count + (value ? 1 : -1))}
        value={document}
        onChange={setDocument}
      />
      <small className="muted">Staff files are private to the owner.</small>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </Form>
  );
}
