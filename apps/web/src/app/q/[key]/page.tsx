import { GuestPage } from "@/features/guest/guest-page";
export default async function TablePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return <GuestPage key={key} tableKey={key} />;
}
