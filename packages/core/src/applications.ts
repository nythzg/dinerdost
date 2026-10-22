import type { Permission, Role } from "./permissions";

export const applications = ["MASTER", "POS", "CAPTAIN", "KITCHEN", "BAR", "COMMAND"] as const;
export type Application = (typeof applications)[number];
export const applicationRoles: Record<Application, readonly Role[]> = {
  MASTER: ["OWNER", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "BARTENDER", "ACCOUNTANT"],
  POS: ["OWNER", "MANAGER", "CASHIER"],
  CAPTAIN: ["OWNER", "MANAGER", "WAITER"],
  KITCHEN: ["OWNER", "MANAGER", "KITCHEN"],
  BAR: ["OWNER", "MANAGER", "BARTENDER"],
  COMMAND: ["OWNER", "MANAGER", "ACCOUNTANT"],
};
const appPermissions: Record<Exclude<Application, "MASTER">, readonly Permission[]> = {
  POS: ["reports", "sessions", "orders", "accept", "bill", "payments", "customers", "settings"],
  CAPTAIN: ["sessions", "orders", "accept", "bill", "customers", "ownAttendance", "ownChecklists"],
  KITCHEN: ["kitchen", "catalog", "inventory", "procurement", "ownExpenses", "ownChecklists", "ownAttendance"],
  BAR: ["kitchen", "catalog", "menu", "inventory", "procurement", "ownAttendance"],
  COMMAND: ["reports", "bill", "customers", "finance", "payroll", "audit", "security", "settings", "team", "attendance"],
};
export function applicationAllows(application: Application | undefined, permission: Permission): boolean {
  return !application || application === "MASTER" || appPermissions[application].includes(permission);
}
export function operationalStream(application?: Application): "FOOD" | "BAR" | null {
  return application === "KITCHEN" ? "FOOD" : application === "BAR" ? "BAR" : null;
}
