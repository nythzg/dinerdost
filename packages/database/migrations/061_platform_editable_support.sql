-- Existing support grants stay read-only. Editing requires an explicit new grant.
ALTER TABLE platform_support_access ADD COLUMN mode text NOT NULL DEFAULT 'READ_ONLY' CHECK(mode IN('READ_ONLY','EDIT'));
