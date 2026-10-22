ALTER TABLE outlets ADD COLUMN receipt_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE uploaded_assets DROP CONSTRAINT uploaded_assets_purpose_check;
ALTER TABLE uploaded_assets ADD CONSTRAINT uploaded_assets_purpose_check
 CHECK(purpose IN ('MENU','STAFF_PHOTO','STAFF_DOCUMENT','RECEIPT_LOGO'));
