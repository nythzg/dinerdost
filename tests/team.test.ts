import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import { can, type Actor } from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, outletId: string;
const key = () => randomUUID(),
  password = "team-test-owner-password";
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  await db.migrate();
  const account = await s.signup(
    db,
    {
      name: "Team Owner",
      email: "owner@team.test",
      password,
      restaurant: "Team QA",
      outlet: "Main",
      qrEnabled: false,
      demo: true,
    },
    "team-owner",
  );
  owner = await s.authenticate(db, account.token);
  outletId = (await s.workspace(db, owner)).outletId;
});
after(async () => {
  await db?.close();
});
const inviteInput = (email: string, role = "WAITER") => ({
  name: "Staff Member",
  email,
  role,
  outletIds: [outletId],
});

test("an owner invite creates a separate staff account with a chosen password and one-use link", async () => {
  const request = key(),
    input = inviteInput("waiter@team.test");
  const invite = await s.createStaffInvitation(db, owner, request, input);
  assert.equal(
    (await s.createStaffInvitation(db, owner, request, input)).token,
    invite.token,
  );
  const preview = await s.inspectStaffInvitation(db, invite.token);
  assert.equal(preview.email, input.email);
  assert.equal(preview.restaurant, "Team QA");
  const account = await s.acceptStaffInvitation(
    db,
    invite.token,
    { name: "Waiter One", password: "staff-chosen-password-123" },
    "waiter-invite",
  );
  const actor = await s.authenticate(db, account.token);
  assert.equal(actor.role, "WAITER");
  assert.notEqual(actor.userId, owner.userId);
  assert.deepEqual(actor.outletIds, [outletId]);
  const signedIn = await s.login(
    db,
    { email: input.email, password: "staff-chosen-password-123" },
    "staff-login",
  );
  assert.equal(
    (await s.authenticate(db, signedIn.token)).employeeId,
    actor.employeeId,
  );
  await assert.rejects(() =>
    s.acceptStaffInvitation(
      db,
      invite.token,
      { name: "Another", password: "another-password-123" },
      "invite-reuse",
    ),
  );
  const workspace = await s.workspace(db, actor);
  assert.equal(workspace.employees, undefined);
  assert.equal(workspace.staffInvitations, undefined);
  const stored = (
    await db.query<any>("SELECT * FROM staff_invitations WHERE id=$1", [
      invite.id,
    ])
  ).rows[0];
  assert.equal(stored.state, "ACCEPTED");
  assert.notEqual(stored.token_hash, invite.token);
});

test("staff cannot grant invitations or owner roles and invalid outlet assignments are denied", async () => {
  for (const role of ["MANAGER", "CASHIER", "WAITER", "KITCHEN"] as const)
    await assert.rejects(
      () =>
        s.createStaffInvitation(
          db,
          { ...owner, role, outletIds: [outletId] },
          key(),
          inviteInput(role + "@team.test"),
        ),
      { code: "FORBIDDEN" },
    );
  await assert.rejects(() =>
    s.createStaffInvitation(
      db,
      owner,
      key(),
      inviteInput("owner-role@team.test", "OWNER"),
    ),
  );
  await assert.rejects(
    () =>
      s.createStaffInvitation(db, owner, key(), {
        ...inviteInput("wrong-outlet@team.test"),
        outletIds: [key()],
      }),
    { code: "OUTLET_FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.createStaffInvitation(
        db,
        owner,
        key(),
        inviteInput("waiter@team.test"),
      ),
    { code: "ACCOUNT_EXISTS" },
  );
});

test("pending invitations reject duplicates, expiry and owner revocation before account creation", async () => {
  const invite = await s.createStaffInvitation(
    db,
    owner,
    key(),
    inviteInput("pending@team.test"),
  );
  await assert.rejects(
    () =>
      s.createStaffInvitation(
        db,
        owner,
        key(),
        inviteInput("pending@team.test"),
      ),
    { code: "INVITE_PENDING" },
  );
  await assert.rejects(
    () =>
      s.revokeStaffInvitation(
        db,
        { ...owner, role: "MANAGER" },
        key(),
        invite.id,
      ),
    { code: "FORBIDDEN" },
  );
  await s.revokeStaffInvitation(db, owner, key(), invite.id);
  await assert.rejects(() =>
    s.acceptStaffInvitation(
      db,
      invite.token,
      { name: "Revoked", password: "staff-password-123" },
      "revoked",
    ),
  );
  const expired = await s.createStaffInvitation(
    db,
    owner,
    key(),
    inviteInput("pending@team.test"),
  );
  await db.query(
    "UPDATE staff_invitations SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [expired.id],
  );
  await assert.rejects(() => s.inspectStaffInvitation(db, expired.token));
  assert.equal(
    (await db.query("SELECT id FROM users WHERE email='pending@team.test'"))
      .rows.length,
    0,
  );
});

test("owner role/outlet updates apply to existing sessions and disabling staff ends access immediately", async () => {
  const invite = await s.createStaffInvitation(
    db,
    owner,
    key(),
    inviteInput("editable@team.test"),
  );
  const account = await s.acceptStaffInvitation(
    db,
    invite.token,
    { name: "Editable Staff", password: "editable-staff-password" },
    "editable",
  );
  const staff = await s.authenticate(db, account.token),
    secondOutlet = key();
  await db.transaction(owner.restroId, (tx) =>
    tx.query(
      "INSERT INTO outlets(id,restro_id,name,code,qr_enabled,payment_policy) VALUES($1,$2,'Second','SECOND',false,'PREPAID')",
      [secondOutlet, owner.restroId],
    ),
  );
  const input = {
    version: 1,
    role: "CASHIER",
    outletIds: [secondOutlet],
    active: true,
    password,
  };
  await s.updateEmployeeRole(db, owner, key(), staff.employeeId, input);
  const cashier = await s.authenticate(db, account.token);
  assert.equal(cashier.role, "CASHIER");
  assert.deepEqual(cashier.outletIds, [secondOutlet]);
  await assert.rejects(() => s.workspace(db, cashier, outletId), {
    code: "OUTLET_FORBIDDEN",
  });
  await assert.rejects(
    () => s.updateEmployeeRole(db, owner, key(), staff.employeeId, input),
    { code: "VERSION_CONFLICT" },
  );
  await s.updateEmployeeRole(db, owner, key(), staff.employeeId, {
    ...input,
    version: 2,
    role: "KITCHEN",
  });
  assert.equal((await s.authenticate(db, account.token)).role, "KITCHEN");
  await s.updateEmployeeRole(db, owner, key(), staff.employeeId, {
    ...input,
    version: 3,
    role: "KITCHEN",
    active: false,
  });
  await assert.rejects(() => s.authenticate(db, account.token), {
    code: "UNAUTHENTICATED",
  });
  await s.employeeAccess(db, owner, key(), staff.employeeId, {
    active: true,
    password,
  });
  assert.equal((await s.authenticate(db, account.token)).role, "KITCHEN");
  await assert.rejects(
    () => s.updateEmployeeRole(db, owner, key(), owner.employeeId, input),
    { code: "OWNER_LOCKOUT" },
  );
  await assert.rejects(
    () =>
      s.updateEmployeeRole(
        db,
        { ...staff, role: "MANAGER" },
        key(),
        staff.employeeId,
        input,
      ),
    { code: "FORBIDDEN" },
  );
});

test("cashier, waiter and chef accounts sign in independently with their assigned permissions", async () => {
  for (const role of ["CASHIER", "WAITER", "KITCHEN"] as const) {
    const email = role.toLowerCase() + "-separate@team.test";
    const invite = await s.createStaffInvitation(
      db,
      owner,
      key(),
      inviteInput(email, role),
    );
    await s.acceptStaffInvitation(
      db,
      invite.token,
      { name: role + " Staff", password: "individual-password-123" },
      role,
    );
    const login = await s.login(
      db,
      { email, password: "individual-password-123" },
      role + "-login",
    );
    const actor = await s.authenticate(db, login.token);
    assert.equal(actor.role, role);
    assert.notEqual(actor.employeeId, owner.employeeId);
    assert.equal(can(actor.role, "team"), false);
    assert.equal(can(actor.role, "payments"), role === "CASHIER");
    assert.equal(can(actor.role, "kitchen"), role === "KITCHEN");
    assert.equal((await s.workspace(db, actor)).actor.role, role);
  }
});

test("invitations and team changes remain tenant-isolated and preserve the audit chain", async () => {
  const invite = await s.createStaffInvitation(
    db,
    owner,
    key(),
    inviteInput("tenant-check@team.test"),
  );
  const other = await s.signup(
    db,
    {
      name: "Other Owner",
      email: "other@team.test",
      password,
      restaurant: "Other Team",
      outlet: "Main",
      qrEnabled: false,
    },
    "other-owner",
  );
  await assert.rejects(
    () => s.revokeStaffInvitation(db, other.actor, key(), invite.id),
    { code: "NOT_FOUND" },
  );
  assert.equal((await s.workspace(db, other.actor)).staffInvitations.length, 0);
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});
