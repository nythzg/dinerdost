import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE,PLATFORM_SESSION_COOKIE,PLATFORM_OWNER_VIEW_COOKIE } from "@dinerdost/services";
import { Workspace } from "@/features/workspace/workspace";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await cookies()).get(SESSION_COOKIE)&&!((await cookies()).get(PLATFORM_SESSION_COOKIE)&&(await cookies()).get(PLATFORM_OWNER_VIEW_COOKIE))) redirect("/signin");
  return (
    <>
      <Workspace />
      {children}
    </>
  );
}
