-- A guest can call staff without creating a dining/financial session.
ALTER TABLE service_requests ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE service_requests ADD COLUMN table_id uuid;
ALTER TABLE service_requests ADD CONSTRAINT service_request_table_fk
  FOREIGN KEY(restro_id,table_id) REFERENCES dining_tables(restro_id,id);
UPDATE service_requests r SET table_id=s.table_id FROM table_sessions s
  WHERE s.id=r.session_id AND s.restro_id=r.restro_id;
ALTER TABLE service_requests ADD CONSTRAINT service_request_location
  CHECK(session_id IS NOT NULL OR table_id IS NOT NULL);
CREATE UNIQUE INDEX one_active_unseated_service_request
  ON service_requests(table_id,kind)
  WHERE session_id IS NULL AND state IN ('OPEN','ACCEPTED','ESCALATED');
