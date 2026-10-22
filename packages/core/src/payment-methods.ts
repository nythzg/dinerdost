export const paymentMethods = [
  "CASH",
  "MANUAL_UPI",
  "UPI_QR",
  "UPI_PHONE",
  "CARD",
  "ONLINE",
] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const paymentMethodNames: Record<PaymentMethod, string> = {
  CASH: "Cash",
  MANUAL_UPI: "UPI transfer",
  UPI_QR: "UPI QR",
  UPI_PHONE: "UPI phone number",
  CARD: "Card",
  ONLINE: "Online transfer",
};
