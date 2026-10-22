import { label, money, type Row } from "@/lib/client";
const aliases: Record<string, string> = {
  basesalary: "salary",
  productionstream: "stream",
  taxcomponents: "taxes",
};
const keyName = (key: string) =>
  aliases[key.replaceAll("_", "").toLowerCase()] ??
  key.replaceAll("_", "").toLowerCase();
const ignored = new Set([
  "id",
  "restroid",
  "outletid",
  "version",
  "createdat",
  "updatedat",
  "password",
  "passwordhash",
  "token",
  "content",
  "roundids",
]);
const fieldLabel = (key: string) =>
  (
    ({
      taxbps: "Tax rate",
      ratebps: "Rate",
      earnbps: "Loyalty earn rate",
      qrenabled: "Table QR",
      qrautoactivate: "Automatic table activation",
      paymentpolicy: "Payment policy",
      reordermilli: "Reorder level",
      taxes: "Taxes",
      roundids: "Affected rounds",
      stockvalue: "Stock value",
      oldstockvalue: "Previous stock value",
    }) as Record<string, string>
  )[keyName(key)] ?? label(key.replace(/([a-z])([A-Z])/g, "$1 $2"));
export function auditAction(action: string) {
  return (
    (
      {
        OUTLET_SAVED: "Outlet updated",
        MENU_SAVED: "Menu item saved",
        QR_POLICY_CHANGED: "Table QR settings changed",
        EMPLOYEE_PROFILE_CHANGED: "Member details updated",
        EMPLOYEE_CREATED: "Team member added",
        FILE_UPLOADED: "File uploaded",
        STOCK_VALUE_ADJUSTED: "Current stock value adjusted",
        INGREDIENT_ARCHIVED: "Inventory item deleted from active stock",
        PURCHASE_EXPENSE_POSTED: "Purchase added to Expenses",
        ORDER_TAX_CHANGED: "Bill tax changed",
        TAX_SETTINGS_SAVED: "Default taxes updated",
      } as Record<string, string>
    )[action] ?? label(action)
  );
}
function text(value: unknown, key: string): string {
  if ((value === null || value === undefined) && keyName(key) === "taxbps")
    return "Menu item rates";
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number" || typeof value === "string") {
    if (/bps/i.test(key)) return Number(value) / 100 + "%";
    if (
      /^(amount|price|salary|payable|paid|discount|tax|charges_total|unit_cost|stockValue|oldStockValue)$/i.test(
        key,
      )
    )
      return money(value);
    return String(value);
  }
  if (Array.isArray(value))
    return value.length
      ? value
          .map((row) =>
            typeof row === "object" && row !== null
              ? Object.entries(row)
                  .filter(([key]) => !ignored.has(keyName(key)))
                  .map(
                    ([key, value]) => fieldLabel(key) + ": " + text(value, key),
                  )
                  .join(", ")
              : String(row),
          )
          .join("; ")
      : "None";
  return Object.entries(value as Row)
    .filter(([key]) => !ignored.has(keyName(key)))
    .map(([key, value]) => fieldLabel(key) + ": " + text(value, key))
    .join("; ");
}
export function auditChanges(before: Row | null, after: Row | null) {
  const old = before ?? {},
    next = after ?? {},
    rows: { field: string; before: string; after: string }[] = [];
  for (const [key, value] of Object.entries(next)) {
    if (ignored.has(keyName(key))) continue;
    const previousKey = Object.keys(old).find(
        (oldKey) => keyName(oldKey) === keyName(key),
      ),
      previous = previousKey ? old[previousKey] : undefined;
    if (
      key === "data" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const nested = auditChanges(previous ?? {}, value as Row);
      rows.push(...nested);
      continue;
    }
    if (
      JSON.stringify(previous) === JSON.stringify(value) ||
      text(previous, key) === text(value, key)
    )
      continue;
    if (
      Array.isArray(value) &&
      Array.isArray(previous) &&
      [...value, ...previous].every(
        (row) => row && typeof row === "object" && row.id,
      )
    ) {
      for (const row of value) {
        const oldRow = previous.find((old) => old.id === row.id);
        if (!oldRow) {
          rows.push({
            field: fieldLabel(key) + " · " + (row.label ?? row.name ?? row.id),
            before: "—",
            after: "Added: " + text(row, key),
          });
          continue;
        }
        rows.push(
          ...auditChanges(oldRow, row).map((change) => ({
            ...change,
            field:
              (row.label ?? row.name ?? fieldLabel(key)) + " · " + change.field,
          })),
        );
      }
      for (const row of previous)
        if (!value.some((next) => next.id === row.id))
          rows.push({
            field: fieldLabel(key) + " · " + (row.label ?? row.name ?? row.id),
            before: text(row, key),
            after: "Removed",
          });
      continue;
    }
    rows.push({
      field: fieldLabel(key),
      before: text(previous, key),
      after: text(value, key),
    });
  }
  return rows;
}
export function AuditChanges({ event }: { event: Row }) {
  const rows = auditChanges(event.old_state, event.new_state);
  return (
    <section className="audit-changes" aria-label="Exact changes">
      <h3>{auditAction(event.action)}</h3>
      {rows.length ? (
        <table>
          <thead>
            <tr>
              <th>Changed</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <th>{row.field}</th>
                <td>{row.before}</td>
                <td>{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>
          {event.reason && event.reason !== event.action
            ? event.reason
            : "Action recorded. This event does not contain field-level values."}
        </p>
      )}
    </section>
  );
}
