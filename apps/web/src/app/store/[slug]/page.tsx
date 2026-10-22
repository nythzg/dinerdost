import { StorefrontPage } from "@/features/storefront/storefront-page";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <StorefrontPage slug={(await params).slug} />;
}
