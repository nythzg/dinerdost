import { ensure } from "./errors";
import { applicationAllows, applicationRoles, type Application } from "./applications";

export const roles = [
  "OWNER",
  "MANAGER",
  "CASHIER",
  "WAITER",
  "KITCHEN",
  "BARTENDER",
  "ACCOUNTANT",
] as const;
export type Role = (typeof roles)[number];
export type Actor = {
  userId: string;
  employeeId: string;
  restroId: string;
  name: string;
  role: Role;
  outletIds: string[];
  ip?: string;
  deviceId?: string;
  authMethod?: string;
  application?: Application;
  /** Server-only session binding. Never include in a workspace or public response. */
  sessionHash?: string;
  /** Server-created, session-bound platform support delegation. */
  supportView?: {operatorId:string;operatorName:string;grantId:string;mode:'READ_ONLY'|'EDIT';expiresAt:string};
};
export type Permission =
  | "settings"
  | "menu"
  | "attendance"
  | "team"
  | "sessions"
  | "orders"
  | "accept"
  | "bill"
  | "payments"
  | "kitchen"
  | "inventory"
  | "procurement"
  | "customers"
  | "finance"
  | "payroll"
  | "audit"
  | "security"
  | "reports"
  | "catalog" | "ownAttendance" | "ownChecklists" | "ownExpenses";
const grants: Record<Role, Permission[]> = {
  OWNER: [
    "settings",
    "menu",
    "attendance",
    "team",
    "sessions",
    "orders",
    "accept",
    "bill",
    "payments",
    "kitchen",
    "inventory",
    "procurement",
    "customers",
    "finance",
    "payroll",
    "audit",
    "security",
    "reports",
  ],
  MANAGER: [
    "menu",
    "attendance",
    "sessions",
    "orders",
    "accept",
    "bill",
    "payments",
    "kitchen",
    "inventory",
    "procurement",
    "customers",
    "audit",
    "security",
    "reports",
  ],
  CASHIER: ["orders", "accept", "bill", "payments", "customers", "sessions"],
  WAITER: ["sessions", "orders", "accept", "bill", "customers"],
  KITCHEN: ["kitchen"],
  BARTENDER: ["kitchen", "catalog", "menu", "inventory", "procurement", "ownAttendance"],
  ACCOUNTANT: ["finance", "payroll", "procurement", "reports"],
};
export function can(subject: Role | Actor, permission: Permission) {
  const actor = typeof subject === "string" ? undefined : subject;
  const role = actor?.role ?? subject as Role;
  if (actor && (!applicationAllows(actor.application, permission) || !applicationRoles[actor.application ?? "MASTER"].includes(role))) return false;
  // New operational app access does not widen the legacy master account's access.
  const extra = actor?.application === "KITCHEN" && role === "KITCHEN" &&
    ["catalog", "inventory", "procurement", "ownAttendance", "ownChecklists", "ownExpenses"].includes(permission);
  const own = ["ownAttendance", "ownChecklists", "ownExpenses"].includes(permission) && actor?.application &&
    ["CAPTAIN", "KITCHEN", "BAR"].includes(actor.application);
  const catalog = permission === "catalog" && (grants[role]?.includes("menu") || grants[role]?.includes("orders"));
  const counter = actor?.application === "POS" && role === "CASHIER" && permission === "reports";
  return !!(extra || own || catalog || counter || grants[role]?.includes(permission));
}
export function requirePermission(actor: Actor, permission: Permission) {
  ensure(
    can(actor, permission),
    "FORBIDDEN",
    "Your role cannot perform this action.",
    403,
  );
}
export function requireOutlet(actor: Actor, outletId: string) {
  ensure(
    actor.role === "OWNER" || actor.outletIds.includes(outletId),
    "OUTLET_FORBIDDEN",
    "This outlet is not assigned to you.",
    403,
  );
}
export function isManager(actor: Actor) {
  return actor.role === "OWNER" || actor.role === "MANAGER";
}
export function maskPhone(phone: string) {
  return phone.length > 6
    ? phone.slice(0, 5) + "••••••" + phone.slice(-2)
    : "••••";
}
