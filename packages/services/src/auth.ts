import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import type { Database } from "@dinerdost/database";
import { ensure, applications, applicationRoles, type Application, type Actor, type Role } from "@dinerdost/core";
import { audit, hash, id, one, rateLimit, type Row } from "./shared";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "dd_session";
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(password: string, encoded: string) {
  const [algorithm, salt, stored] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !stored) return false;
  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(stored, "hex");
  return (
    expected.length === candidate.length && timingSafeEqual(candidate, expected)
  );
}
const signupSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.email().toLowerCase(),
    password: z.string().min(12).max(128),
    restaurant: z.string().trim().min(2).max(150),
    outlet: z.string().trim().min(2).max(150),
    qrEnabled: z.boolean(),
    demo: z.boolean().default(false),
    taxBps: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
export async function signup(db: Database, input: unknown, ip: string) {
  const data = signupSchema.parse(input);
  await rateLimit(db, `signup:${ip}`, 5, 3600);
  const encoded = await passwordHash(data.password);
  const userId = id(),
    restroId = id(),
    employeeId = id(),
    outletId = id();
  const actor: Actor = {
    userId,
    restroId,
    employeeId,
    name: data.name,
    role: "OWNER",
    outletIds: [],
    ip,
  };
  await db.transaction(null, async (tx) => {
    await tx.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
      [userId, data.email, data.name, encoded],
    );
    await tx.query(
      "INSERT INTO restaurants(id,name,slug,is_demo) VALUES($1,$2,$3,$4)",
      [
        restroId,
        data.restaurant,
        data.restaurant
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") +
          "-" +
          restroId.slice(0, 6),
        data.demo,
      ],
    );
    await tx.query(
      "INSERT INTO outlets(id,restro_id,name,code,qr_enabled,payment_policy,tax_bps) VALUES($1,$2,$3,'OUT01',$4,'PREPAID',$5)",
      [outletId, restroId, data.outlet, data.qrEnabled, data.taxBps],
    );
    await tx.query(
      "INSERT INTO employees(id,restro_id,user_id,name,role,outlet_ids) VALUES($1,$2,$3,$4,'OWNER',$5)",
      [employeeId, restroId, userId, data.name, [outletId]],
    );
    if (data.demo) {
      for (let i = 1; i <= 12; i++)
        await tx.query(
          "INSERT INTO dining_tables(id,restro_id,outlet_id,label,seats,public_key) VALUES($1,$2,$3,$4,4,$5)",
          [
            id(),
            restroId,
            outletId,
            `T${String(i).padStart(2, "0")}`,
            randomBytes(20).toString("hex"),
          ],
        );
      const starters = [
        ["Paneer tikka", "Starters", 28000, "Tandoor"],
        ["Dal makhani", "Mains", 26000, "Main kitchen"],
        ["Dum biryani", "Mains", 32000, "Main kitchen"],
        ["Butter naan", "Breads", 6000, "Tandoor"],
        ["Mint cooler", "Beverages", 16000, "Bar"],
        ["Saffron cheesecake", "Desserts", 22000, "Pastry"],
      ];
      for (const [name, category, price, station] of starters)
        await tx.query(
          "INSERT INTO menu_items(id,restro_id,outlet_id,name,category,price,tax_bps,station,production_stream,image_url,image_is_sample) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)",
          [
            id(),
            restroId,
            outletId,
            name,
            category,
            price,
            data.taxBps,
            station,
            station === "Bar" ? "BAR" : "FOOD",
            "/images/menu/samples/" + String(name).toLowerCase().replaceAll(" ", "-") + ".webp",
          ],
        );
    }
    await tx.query(
      "INSERT INTO menu_categories(id,restro_id,outlet_id,name) SELECT gen_random_uuid(),restro_id,outlet_id,category FROM menu_items WHERE outlet_id=$1 GROUP BY restro_id,outlet_id,category ON CONFLICT DO NOTHING",
      [outletId],
    );
    await audit(tx, actor, {
      action: "RESTAURANT_CREATED",
      entityType: "RESTAURANT",
      entityId: restroId,
      outletId,
      newState: {
        name: data.restaurant,
        qrEnabled: data.qrEnabled,
        demo: data.demo,
        taxBps: data.taxBps,
      },
    });
  });
  const token = await newSession(db, userId, employeeId);
  return { token, actor };
}
async function newSession(db: Database, userId: string, employeeId: string, application: Application = "MASTER") {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO auth_sessions(token_hash,user_id,employee_id,expires_at,application) VALUES($1,$2,$3,now()+interval '12 hours',$4)",
    [hash(token), userId, employeeId, application],
  );
  return token;
}
export async function login(db: Database, input: unknown, ip: string) {
  const data = z
    .object({
      email: z.email().toLowerCase(),
      password: z.string().min(1).max(128),
      application: z.enum(applications).default("MASTER"),
    })
    .strict()
    .parse(input);
  await rateLimit(db, `login:${ip}:${data.email}`, 8, 900);
  const result = await db.query<Row>(
    "SELECT * FROM users WHERE email=$1 AND disabled=false",
    [data.email],
  );
  const user = result.rows[0];
  const fallback = "scrypt:55f3d41d5650e6ca1722ae327624a70b:" + "0".repeat(128);
  const valid = await passwordMatches(
    data.password,
    user?.password_hash ?? fallback,
  );
  ensure(
    user && valid,
    "INVALID_CREDENTIALS",
    "Email or password is incorrect.",
    401,
  );
  const employee = await one(
    db,
    "SELECT * FROM employees WHERE user_id=$1 AND active=true ORDER BY created_at LIMIT 1",
    [user.id],
  );
  ensure(applicationRoles[data.application].includes(employee.role), "APPLICATION_FORBIDDEN", "This account's role cannot sign in to this application.", 403);
  return { token: await newSession(db, user.id, employee.id, data.application) };
}
export async function authenticate(
  db: Database,
  token: string | undefined,
): Promise<Actor> {
  ensure(token, "UNAUTHENTICATED", "Sign in to continue.", 401);
  const result = await db.query<Row>(
    "SELECT s.user_id,s.application,e.id,e.restro_id,e.name,e.role,e.outlet_ids FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN employees e ON e.id=s.employee_id AND e.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled AND e.active",
    [hash(token)],
  );
  const row = result.rows[0];
  ensure(row, "UNAUTHENTICATED", "Your session expired. Sign in again.", 401);
  ensure(applicationRoles[row.application as Application].includes(row.role), "UNAUTHENTICATED", "Your access to this application changed. Sign in again.", 401);
  return {
    userId: row.user_id,
    employeeId: row.id,
    restroId: row.restro_id,
    name: row.name,
    role: row.role as Role,
    outletIds: row.outlet_ids,
    application: row.application,
    sessionHash: hash(token),
  };
}
export async function logout(db: Database, token: string | undefined) {
  if (token)
    await db.query("DELETE FROM auth_sessions WHERE token_hash=$1", [
      hash(token),
    ]);
  return { ok: true };
}
export async function stepUp(db: Database, actor: Actor, password: unknown) {
  ensure(
    typeof password === "string" && password.length > 0,
    "STEP_UP_REQUIRED",
    "Confirm your password for this action.",
    403,
  );
  await rateLimit(db, `stepup:${actor.userId}`, 5, 300);
  const user = await one(db, "SELECT password_hash FROM users WHERE id=$1", [
    actor.userId,
  ]);
  ensure(
    await passwordMatches(password, user.password_hash),
    "STEP_UP_FAILED",
    "Password confirmation failed.",
    403,
  );
}
