import type { Metadata } from "next";
import "./globals.css";
import "@/features/qr/qr.css";
import "@/features/guest/guest.css";
import "@/styles/interface.css";
import "@/styles/workspace-controls.css";
import "@/features/qr/qr-workspace.css";
import "@/styles/client-feedback.css";
import "@/features/tables/tables.css";
import "@/features/team/team.css";
import "@/features/storefront/storefront.css";
import "@/styles/late-updates.css";
import "@/styles/review-045.css";
import "@/styles/review-046.css";
import "@/styles/workspace-tools.css";
import "@/styles/calculator.css";
import "@/styles/inventory-tools.css";
import "sweetalert2/dist/sweetalert2.css";
import "@/styles/review-048.css";
import "@/styles/review-049.css";
export const metadata: Metadata = {
  title: { default: "Diner Dost", template: "%s · Diner Dost" },
  description: "Your restaurant, in good company.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
