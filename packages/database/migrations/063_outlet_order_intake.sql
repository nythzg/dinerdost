-- Existing outlets keep accepting orders until an authorized manager pauses intake.
ALTER TABLE outlets ADD COLUMN order_intake_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE outlets ADD COLUMN order_intake_version integer NOT NULL DEFAULT 1 CHECK(order_intake_version > 0);
