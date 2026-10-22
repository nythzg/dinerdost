"use client";
import { useDesk } from "../workspace/context";

const requirements = {
  payments: {
    title: "Payment gateway",
    button: "Merchant account + webhook required",
    items: [
      "Gateway merchant account and server credentials",
      "Signed payment webhooks and reconciliation testing",
    ],
  },
  messaging: {
    title: "WhatsApp & SMS automation",
    button: "Provider + approved templates required",
    items: [
      "WhatsApp/SMS provider account and server credentials",
      "Approved sender, message templates and customer opt-in",
      "Delivery callbacks before enabling automatic sending",
    ],
  },
  orderTokens: {
    title: "Order-token WhatsApp",
    button: "Order tokens · WhatsApp setup required",
    items: [
      "Trigger: an order token is issued to a customer",
      "WhatsApp provider account and approved order-token template",
      "Customer phone and messaging opt-in",
    ],
  },
  delivery: {
    title: "Swiggy / Zomato",
    button: "Official order-feed access required",
    items: [
      "Restaurant-approved Swiggy/Zomato order-feed/API access",
      "Outlet mapping and signed order callbacks",
      "Order, KOT and KDS testing with the approved feed",
    ],
  },
  hardware: {
    title: "Restaurant hardware",
    button: "Device model + pairing required",
    items: [
      "POS, printer or EDC device model and supported SDK",
      "Local pairing and physical receipt testing",
    ],
  },
  fingerprint: {
    title: "Fingerprint attendance",
    button: "Fingerprint · device + SDK required",
    items: [
      "Fingerprint device model and supported SDK/API",
      "Employee-to-device ID mapping",
      "Verified attendance callbacks from the paired device",
    ],
  },
  invoice: {
    title: "Invoice scan",
    button: "OCR provider + invoice samples required",
    items: [
      "OCR provider and server credentials",
      "Sample invoices for field mapping and review before stock posting",
    ],
  },
  offline: {
    title: "Offline service",
    button: "Local edge device + pairing required",
    items: [
      "Local edge device and LAN service",
      "Paired devices and failover/sync testing",
    ],
  },
};

export function IntegrationRequirementsButton({
  kind,
}: {
  kind: keyof typeof requirements;
}) {
  const { modal } = useDesk();
  const setup = requirements[kind];
  return (
    <button
      className="button integration-setup-button"
      onClick={() =>
        modal(
          setup.title,
          <div className="integration-requirements">
            <p>Setup deferred. Required to connect:</p>
            <ul>
              {setup.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <small>Not connected.</small>
          </div>,
        )
      }
    >
      {setup.button}
    </button>
  );
}
