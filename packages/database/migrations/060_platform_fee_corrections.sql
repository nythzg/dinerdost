-- Fee corrections are separate immutable platform ledger entries, never diner payment edits.
ALTER TABLE platform_fee_accruals DROP CONSTRAINT platform_fee_accruals_amount_check;
ALTER TABLE platform_fee_accruals ADD CONSTRAINT platform_fee_signed_amount CHECK(amount BETWEEN -1000000000000 AND 1000000000000);
ALTER TABLE platform_fee_accruals ADD COLUMN parent_id uuid REFERENCES platform_fee_accruals(id);

ALTER TABLE platform_db_samples ADD COLUMN observations jsonb NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX platform_saas_payment_reference_normalized ON platform_saas_payments(restro_id,lower(reference));
CREATE UNIQUE INDEX platform_settlement_reference_normalized ON platform_settlement_entries(restro_id,lower(reference));
