-- Existing rounds keep their original authorization rules and recorded amounts.
ALTER TABLE outlets ADD COLUMN qr_payment_mode text NOT NULL DEFAULT 'ORDER_ONLY' CHECK(qr_payment_mode IN ('ORDER_ONLY','PAYMENT'));
ALTER TABLE order_rounds ADD COLUMN payment_gate text NOT NULL DEFAULT 'LEGACY' CHECK(payment_gate IN ('LEGACY','STAFF','QR_ORDER_ONLY','QR_PAYMENT'));

CREATE OR REPLACE FUNCTION kot_authority_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM order_rounds r JOIN orders o ON o.id=r.order_id AND o.restro_id=r.restro_id JOIN outlets t ON t.id=o.outlet_id AND t.restro_id=o.restro_id
 WHERE r.id=NEW.round_id AND r.restro_id=NEW.restro_id AND r.status='ACCEPTED' AND (
 (r.paid=r.payable AND r.payable>0) OR (r.payable=0 AND r.quote_version=r.version)
 OR (r.payment_gate='STAFF' AND r.staff_entered)
 OR (r.payment_gate='QR_ORDER_ONLY' AND o.source='CUSTOMER_QR')
 OR (r.postpaid_authorized AND ((r.payment_gate='LEGACY' AND t.payment_policy='POSTPAID') OR (r.payment_gate='QR_PAYMENT' AND o.source='CUSTOMER_QR'))))) THEN
  RAISE EXCEPTION 'KOT_NOT_AUTHORIZED: transaction control has not authorized this round';
 END IF; RETURN NEW;
END; $$;
