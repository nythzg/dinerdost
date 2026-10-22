import { AcceptInvitation } from "@/features/team/accept-invitation";
export const metadata = {
  title: "Join team · Diner Dost",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AcceptInvitation key={token} token={token} />;
}
