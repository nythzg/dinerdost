import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import type { Actor } from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, outletId: string;
const key = () => randomUUID();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  const account = await s.signup(
    db,
    {
      name: "Profile Owner",
      email: "profile-owner@example.test",
      password: "profile-owner-password-123",
      restaurant: "Profile QA",
      outlet: "Main",
      qrEnabled: false,
      demo: true,
    },
    "profile",
  );
  owner = await s.authenticate(db, account.token);
  outletId = (await s.workspace(db, owner)).outletId;
});
after(async () => {
  await db?.close();
});
test("owner can edit own and staff names/salaries without changing account access; stale writes are rejected", async () => {
  const initial = (await s.workspace(db, owner)).employees.find(
    (e: any) => e.id === owner.employeeId,
  );
  const input = {
    version: initial.version,
    name: "Updated Owner",
    salary: 1234567,
  };
  const request = key();
  await s.updateEmployeeProfile(db, owner, request, owner.employeeId, input);
  await s.updateEmployeeProfile(db, owner, request, owner.employeeId, input);
  const current = (await s.workspace(db, owner)).employees.find(
    (e: any) => e.id === owner.employeeId,
  );
  assert.equal(current.name, "Updated Owner");
  assert.equal(Number(current.base_salary), 1234567);
  assert.equal(current.version, initial.version + 1);
  assert.equal(current.role, "OWNER");
  assert.equal(current.active, true);
  assert.deepEqual(current.outlet_ids, initial.outlet_ids);
  await assert.rejects(
    () => s.updateEmployeeProfile(db, owner, key(), owner.employeeId, input),
    { code: "VERSION_CONFLICT" },
  );
  const account = await s.login(
    db,
    {
      email: "profile-owner@example.test",
      password: "profile-owner-password-123",
    },
    "profile-login",
  );
  assert.equal((await s.authenticate(db, account.token)).name, "Updated Owner");
  const staff = await s.addEmployee(db, owner, key(), {
    name: "Original Staff",
    email: "profile-staff@example.test",
    password: "profile-staff-password-123",
    role: "CASHIER",
    outletIds: [outletId],
  });
  await s.updateEmployeeProfile(db, owner, key(), staff.id, {
    version: 1,
    name: "Updated Staff",
    salary: 2800000,
  });
  const staffLogin = await s.login(
    db,
    {
      email: "profile-staff@example.test",
      password: "profile-staff-password-123",
    },
    "profile-staff-login",
  );
  const cashier = await s.authenticate(db, staffLogin.token);
  assert.equal(cashier.name, "Updated Staff");
  assert.equal(cashier.role, "CASHIER");
  await assert.rejects(
    () =>
      s.updateEmployeeProfile(db, cashier, key(), staff.id, {
        version: 2,
        name: "Unauthorized",
        salary: 1,
      }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(() =>
    s.updateEmployeeProfile(db, owner, key(), staff.id, {
      version: 2,
      name: "Updated Staff",
      salary: -1,
    }),
  );
  await assert.rejects(() =>
    s.updateEmployeeProfile(db, owner, key(), staff.id, {
      version: 2,
      name: "Updated Staff",
      salary: 1,
      role: "OWNER",
    }),
  );
});
test("vendors remain editable after approval/completion while purchases retain their original values", async () => {
  const values = {
    category: "Vegetables",
    description: "Daily produce",
    contact: "Supplier Contact",
    phone: "9123456789",
    email: "vendor@example.test",
    address: "Main road",
    gstin: "",
  };
  const saved = await s.saveRecord(db, owner, key(), "vendors", {
    outletId,
    title: "Original Vendor",
    data: values,
  });
  const purchase = await s.saveRecord(db, owner, key(), "purchases", {
    outletId,
    title: "Existing Purchase",
    data: {
      vendorId: saved.id,
      reference: "UNCHANGED-001",
      amount: 25000,
      note: "Original purchase",
    },
  });
  const before = (await s.listRecords(db, owner, "purchases", outletId)).find(
    (r: any) => r.id === purchase.id,
  );
  let version = 1;
  for (const state of ["DRAFT", "APPROVED", "COMPLETED"]) {
    if (state !== "DRAFT") {
      await s.recordDecision(db, owner, key(), saved.id, {
        version,
        state,
        reason: "Vendor lifecycle",
      });
      version++;
    }
    const request = key();
    const input = {
      id: saved.id,
      version,
      outletId,
      title: "Updated " + state,
      data: {
        ...values,
        category: "Fresh vegetables",
        description: "Updated supply details",
        contact: "New Contact",
      },
    };
    await s.saveRecord(db, owner, request, "vendors", input);
    await s.saveRecord(db, owner, request, "vendors", input);
    version++;
    const vendor: any = (
      await s.listRecords(db, owner, "vendors", outletId)
    ).find((r: any) => r.id === saved.id);
    assert.equal(vendor?.state, state);
    assert.equal(vendor?.version, version);
    assert.equal(vendor?.data.contact, "New Contact");
    await assert.rejects(
      () => s.saveRecord(db, owner, key(), "vendors", input),
      { code: "VERSION_CONFLICT" },
    );
  }
  assert.deepEqual(
    (await s.listRecords(db, owner, "purchases", outletId)).find(
      (r: any) => r.id === purchase.id,
    ),
    before,
  );
  await assert.rejects(
    () =>
      s.saveRecord(
        db,
        { ...owner, role: "CASHIER", outletIds: [outletId] },
        key(),
        "vendors",
        { id: saved.id, version, outletId, title: "No access", data: values },
      ),
    { code: "FORBIDDEN" },
  );
});
test("member and vendor edits are tenant isolated and leave an intact audit trail", async () => {
  const other = await s.signup(
    db,
    {
      name: "Other Profile Owner",
      email: "other-profile@example.test",
      password: "other-profile-password-123",
      restaurant: "Other Profile QA",
      outlet: "Main",
      qrEnabled: false,
    },
    "other-profile",
  );
  await assert.rejects(
    () =>
      s.updateEmployeeProfile(db, other.actor, key(), owner.employeeId, {
        version: 1,
        name: "No access",
        salary: 0,
      }),
    { code: "NOT_FOUND" },
  );
  const vendor = (await s.listRecords(db, owner, "vendors", outletId))[0];
  await assert.rejects(
    () =>
      s.saveRecord(db, other.actor, key(), "vendors", {
        id: vendor.id,
        version: vendor.version,
        outletId,
        title: "No access",
        data: vendor.data,
      }),
    { code: "NOT_FOUND" },
  );
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});
