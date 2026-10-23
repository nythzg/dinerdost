import {assertPlatformInviteAcceptance} from "./platform-policy";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import {
  ensure,
  requirePermission,
  applications,
  applicationRoles,
  type Actor,
} from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  hash,
  id,
  one,
  rateLimit,
  type Row,
} from "./shared";
import { passwordHash, stepUp } from "./auth";
import { staffDetailsSchema, writeStaffDetails } from "./assets";

const staffRole = z.enum([
  "MANAGER",
  "CASHIER",
  "WAITER",
  "KITCHEN",
  "BARTENDER",
  "ACCOUNTANT",
]);

export async function updateEmployeeProfile(
  db: Database,
  actor: Actor,
  key: string,
  employeeId: string,
  input: unknown,
) {
  requirePermission(actor, "team");
  const data = z
    .object({
      version: z.number().int(),
      name: z.string().trim().min(2).max(120),
      salary: z.number().int().min(0).max(100000000),
      details: staffDetailsSchema.optional(),
    })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "EMPLOYEE_PROFILE_CHANGED",
    { employeeId, ...data },
    async (tx) => {
      const employee = await one(
        tx,
        "SELECT * FROM employees WHERE id=$1 FOR UPDATE",
        [employeeId],
      );
      expectedVersion(employee.version, data.version);
      if (data.details)
        await writeStaffDetails(tx, actor, employeeId, data.details);
      await tx.query(
        "UPDATE employees SET name=$2,base_salary=$3,version=version+1 WHERE id=$1",
        [employeeId, data.name, data.salary],
      );
      await audit(tx, actor, {
        action: "EMPLOYEE_PROFILE_CHANGED",
        entityType: "EMPLOYEE",
        entityId: employeeId,
        oldState: { name: employee.name, salary: employee.base_salary },
        newState: { name: data.name, salary: data.salary },
        risk: "WARNING",
      });
      return { ok: true };
    },
  );
}
const assignments = z.array(z.uuid()).min(1).max(100);
async function checkOutlets(tx: Sql, ids: string[]) {
  ensure(
    new Set(ids).size === ids.length,
    "DUPLICATE_OUTLET",
    "Choose each outlet once.",
  );
  ensure(
    (await tx.query("SELECT id FROM outlets WHERE id=ANY($1::uuid[])", [ids]))
      .rows.length === ids.length,
    "OUTLET_FORBIDDEN",
    "Choose outlets belonging to this restaurant.",
    403,
  );
}
export async function createStaffInvitation(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "team");
  const data = z
    .object({
      name: z.string().trim().min(2).max(120),
      email: z.email().toLowerCase(),
      role: staffRole,
      outletIds: assignments,
    })
    .strict()
    .parse(input);
  const token = randomBytes(32).toString("base64url");
  return command(db, actor, key, "STAFF_INVITED", data, async (tx) => {
    await checkOutlets(tx, data.outletIds);
    await one(
      tx,
      "SELECT id FROM employees WHERE id=$1 AND role='OWNER' AND active=true FOR UPDATE",
      [actor.employeeId],
    );
    ensure(
      !(
        await tx.query(
          "SELECT id FROM staff_invitations WHERE email=$1 AND state='PENDING' AND expires_at>now()",
          [data.email],
        )
      ).rows.length,
      "INVITE_PENDING",
      "A pending invite already exists. Revoke it before creating another.",
      409,
    );
    await tx.query("RESET ROLE");
    const existing = (
      await tx.query("SELECT id FROM users WHERE email=$1", [data.email])
    ).rows.length;
    await tx.query("SET LOCAL ROLE dinerdost_app");
    ensure(
      !existing,
      "ACCOUNT_EXISTS",
      "This email already has an account. Update its existing team access instead.",
      409,
    );
    const invitation = await one(
      tx,
      "INSERT INTO staff_invitations(id,restro_id,invited_by,email,name,role,outlet_ids,token_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,expires_at",
      [
        id(),
        actor.restroId,
        actor.employeeId,
        data.email,
        data.name,
        data.role,
        data.outletIds,
        hash(token),
      ],
    );
    await audit(tx, actor, {
      action: "STAFF_INVITED",
      entityType: "STAFF_INVITATION",
      entityId: invitation.id,
      newState: {
        email: data.email,
        role: data.role,
        outletIds: data.outletIds,
      },
      reason: "Owner created a staff invite",
    });
    return {
      id: invitation.id as string,
      expiresAt: invitation.expires_at,
      token,
    };
  });
}
export async function revokeStaffInvitation(
  db: Database,
  actor: Actor,
  key: string,
  invitationId: string,
) {
  requirePermission(actor, "team");
  z.uuid().parse(invitationId);
  return command(
    db,
    actor,
    key,
    "STAFF_INVITE_REVOKED",
    { invitationId },
    async (tx) => {
      const invitation = await one(
        tx,
        "SELECT * FROM staff_invitations WHERE id=$1 FOR UPDATE",
        [invitationId],
      );
      ensure(
        invitation.state === "PENDING",
        "INVITE_CLOSED",
        "This invite is already closed.",
        409,
      );
      await tx.query(
        "UPDATE staff_invitations SET state='REVOKED' WHERE id=$1",
        [invitationId],
      );
      await audit(tx, actor, {
        action: "STAFF_INVITE_REVOKED",
        entityType: "STAFF_INVITATION",
        entityId: invitationId,
        oldState: { state: invitation.state },
        newState: { state: "REVOKED" },
      });
      return { ok: true };
    },
  );
}
export async function inspectStaffInvitation(db: Database, token: string) {
  ensure(
    /^[A-Za-z0-9_-]{43}$/.test(token),
    "INVITE_UNAVAILABLE",
    "This invite has expired or is unavailable.",
    404,
  );
  const invitation = await one(
    db,
    "SELECT i.*,r.name AS restaurant_name FROM staff_invitations i JOIN restaurants r ON r.id=i.restro_id WHERE i.token_hash=$1 AND i.state='PENDING' AND i.expires_at>now()",
    [hash(token)],
    "This invite has expired or is unavailable.",
  );
  return {
    name: invitation.name,
    email: invitation.email,
    role: invitation.role,
    restaurant: invitation.restaurant_name,
    expiresAt: invitation.expires_at,
  };
}
export async function acceptStaffInvitation(
  db: Database,
  token: string,
  input: unknown,
  ip: string,
) {
  await rateLimit(db, "invite-accept:" + ip + ":" + hash(token), 8, 900);
  await inspectStaffInvitation(db, token);
  const data = z
    .object({
      name: z.string().trim().min(2).max(120),
      password: z.string().min(12).max(128),
      application: z.enum(applications).default("MASTER"),
    })
    .strict()
    .parse(input);
  const encoded = await passwordHash(data.password),
    sessionToken = randomBytes(32).toString("base64url");
  const context = await one(
    db,
    "SELECT restro_id FROM staff_invitations WHERE token_hash=$1",
    [hash(token)],
  );
  return db.transaction(context.restro_id, async (tx) => {
    await assertPlatformInviteAcceptance(tx,data.application==='MASTER');
    const invitation = await one(
      tx,
      "SELECT * FROM staff_invitations WHERE token_hash=$1 AND state='PENDING' AND expires_at>now() FOR UPDATE",
      [hash(token)],
      "This invite has expired or is unavailable.",
    );
    await one(
      tx,
      "SELECT id FROM employees WHERE id=$1 AND role='OWNER' AND active=true",
      [invitation.invited_by],
      "This invite is unavailable.",
    );
    await checkOutlets(tx, invitation.outlet_ids);
    ensure(
      applicationRoles[data.application].includes(invitation.role),
      "APPLICATION_FORBIDDEN",
      "This invite is for a role that uses another application.",
      403,
    );
    const userId = id(),
      employeeId = id();
    await tx.query("RESET ROLE");
    ensure(
      !(
        await tx.query("SELECT id FROM users WHERE email=$1", [
          invitation.email,
        ])
      ).rows.length,
      "ACCOUNT_EXISTS",
      "An account already exists for this email. Sign in or contact the owner.",
      409,
    );
    await tx.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
      [userId, invitation.email, data.name, encoded],
    );
    await tx.query("SET LOCAL ROLE dinerdost_app");
    await tx.query(
      "INSERT INTO employees(id,restro_id,user_id,name,role,outlet_ids) VALUES($1,$2,$3,$4,$5,$6)",
      [
        employeeId,
        context.restro_id,
        userId,
        data.name,
        invitation.role,
        invitation.outlet_ids,
      ],
    );
    await tx.query(
      "UPDATE staff_invitations SET state='ACCEPTED',accepted_by=$2 WHERE id=$1",
      [invitation.id, employeeId],
    );
    const actor: Actor = {
      userId,
      employeeId,
      restroId: context.restro_id,
      name: data.name,
      role: invitation.role,
      outletIds: invitation.outlet_ids,
      ip,
    };
    await audit(tx, actor, {
      action: "STAFF_INVITE_ACCEPTED",
      entityType: "EMPLOYEE",
      entityId: employeeId,
      newState: {
        invitationId: invitation.id,
        invitedBy: invitation.invited_by,
        role: invitation.role,
        outletIds: invitation.outlet_ids,
      },
    });
    await tx.query("RESET ROLE");
    await tx.query(
      "INSERT INTO auth_sessions(token_hash,user_id,employee_id,expires_at,application) VALUES($1,$2,$3,now()+interval '12 hours',$4)",
      [hash(sessionToken), userId, employeeId, data.application],
    );
    return { token: sessionToken, role: invitation.role };
  });
}
export async function updateEmployeeRole(
  db: Database,
  actor: Actor,
  key: string,
  employeeId: string,
  input: unknown,
) {
  requirePermission(actor, "team");
  const data = z
    .object({
      version: z.number().int(),
      role: staffRole,
      outletIds: assignments,
      active: z.boolean(),
      password: z.string(),
    })
    .strict()
    .parse(input);
  ensure(
    employeeId !== actor.employeeId,
    "OWNER_LOCKOUT",
    "You cannot change your own owner access.",
  );
  await stepUp(db, actor, data.password);
  return command(
    db,
    actor,
    key,
    "EMPLOYEE_ROLE_CHANGED",
    { employeeId, ...data, password: undefined },
    async (tx) => {
      await checkOutlets(tx, data.outletIds);
      const employee = await one(
        tx,
        "SELECT * FROM employees WHERE id=$1 AND role<>'OWNER' FOR UPDATE",
        [employeeId],
      );
      expectedVersion(employee.version, data.version);
      await tx.query(
        "UPDATE employees SET role=$2,outlet_ids=$3,active=$4,version=version+1 WHERE id=$1",
        [employeeId, data.role, data.outletIds, data.active],
      );
      await audit(tx, actor, {
        action: "EMPLOYEE_ROLE_CHANGED",
        entityType: "EMPLOYEE",
        entityId: employeeId,
        oldState: {
          role: employee.role,
          outletIds: employee.outlet_ids,
          active: employee.active,
        },
        newState: {
          role: data.role,
          outletIds: data.outletIds,
          active: data.active,
        },
      });
      return { ok: true };
    },
  );
}
