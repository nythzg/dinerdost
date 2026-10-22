import type { Sql } from "@dinerdost/database";
import { customerName, ensure, normalizePhone } from "@dinerdost/core";
import { id, one, type Row } from "./shared";

export async function bindCustomer(
  tx: Sql,
  restroId: string,
  rawName: string,
  rawPhone: string,
  consent = false,
) {
  const name = customerName(rawName),
    phone = normalizePhone(rawPhone);
  const inserted = (
    await tx.query<Row>(
      "INSERT INTO customers(id,restro_id,name,phone,marketing_consent) VALUES($1,$2,$3,$4,$5) ON CONFLICT(restro_id,phone) DO NOTHING RETURNING *",
      [id(), restroId, name, phone, consent],
    )
  ).rows[0];
  const customer =
    inserted ??
    (await one(tx, "SELECT * FROM customers WHERE phone=$1 FOR SHARE", [
      phone,
    ]));
  ensure(
    customerName(customer.name).toLowerCase() === name.toLowerCase(),
    "CUSTOMER_NAME_MISMATCH",
    "This phone number is linked to a different customer name. Use the matching details or ask a manager for help.",
    409,
  );
  return {
    customer,
    inserted: !!inserted,
    snapshot: {
      name: customer.name,
      phone,
      otpVerified: customer.otp_verified,
    },
  };
}
