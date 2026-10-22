import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = "https://dinerdost-app.vercel.app",
  uuid = "00000000-0000-0000-0000-000000000000";
const cases: { path: string; status: number; location?: string }[] = [
  { path: "/signin", status: 200 },
  { path: "/signup", status: 200 },
  { path: "/images/menu/samples/butter-naan.webp", status: 200 },
  { path: "/api/workspace", status: 401 },
  { path: "/api/notifications", status: 401 },
  { path: "/api/stock-summary", status: 401 },
  { path: "/api/activity/expenses", status: 401 },
  { path: "/api/loyalty", status: 401 },
  { path: "/api/staff-files/" + uuid, status: 401 },
  { path: "/api/receipt-images/" + uuid, status: 401 },
  { path: "/preview", status: 404 },
  { path: "/api/stock-reports", status: 401 },
  { path: "/api/dish-report", status: 401 },
  { path: `/kot/${uuid}/${uuid}`, status: 307, location: "/signin" },
];
const results = [];
for (const item of cases) {
  const reply = await fetch(base + item.path, { redirect: "manual" });
  const location = reply.headers.get("location"),
    sessionIssued = (reply.headers.get("set-cookie") ?? "").includes(
      "dd_session=",
    ),
    frame = reply.headers.get("x-frame-options"),
    csp = reply.headers.get("content-security-policy");
  assert.equal(reply.status, item.status, item.path);
  assert.equal(
    sessionIssued,
    false,
    item.path + " issued an anonymous session",
  );
  if (item.location) assert.ok(location?.endsWith(item.location));
  if (item.path === "/api/workspace") assert.equal(frame, "DENY");
  if (item.path.startsWith("/kot/")) {
    assert.equal(frame, "SAMEORIGIN");
    assert.equal(csp, "frame-ancestors 'self'");
  }
  results.push({
    path: item.path,
    status: reply.status,
    sessionIssued,
    location,
    frame,
    csp,
  });
  await reply.arrayBuffer();
}
for (const action of ["stockValue", "ingredientArchive", "demerge"]) {
  const reply = await fetch(base + "/api/commands", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ action, input: {} }),
  });
  assert.equal(
    reply.status,
    401,
    action + " must require staff authentication",
  );
  assert.equal(
    (reply.headers.get("set-cookie") ?? "").includes("dd_session="),
    false,
  );
  results.push({
    path: "/api/commands#" + action,
    status: reply.status,
    sessionIssued: false,
    location: null,
    frame: reply.headers.get("x-frame-options"),
    csp: reply.headers.get("content-security-policy"),
  });
  await reply.arrayBuffer();
}
await writeFile(
  "verification/production-public-046.json",
  JSON.stringify(
    {
      base,
      checks: results.length,
      passed: true,
      results,
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
console.log(results.length + " public access checks passed.");
