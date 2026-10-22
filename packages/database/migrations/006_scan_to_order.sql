-- Table-scoped visits allow menu browsing without opening a financial session.
ALTER TABLE public_grants ADD COLUMN table_id uuid;
UPDATE public_grants g SET table_id=s.table_id FROM table_sessions s WHERE s.id=g.session_id AND s.restro_id=g.restro_id;
ALTER TABLE public_grants ADD CONSTRAINT public_grant_table FOREIGN KEY(restro_id,table_id) REFERENCES dining_tables(restro_id,id);
CREATE INDEX public_grant_table_visit ON public_grants(table_id,device_hash) WHERE revoked_at IS NULL;
