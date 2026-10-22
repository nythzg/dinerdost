import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@dinerdost/services";
export default async function AppPage() {
  if (!(await cookies()).get(SESSION_COOKIE)) redirect("/signin");
  return null;
}
