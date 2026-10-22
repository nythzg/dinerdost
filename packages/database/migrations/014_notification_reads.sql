CREATE TABLE notification_reads (
  restro_id uuid NOT NULL REFERENCES restaurants(id),
  employee_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES audit_events(id),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(employee_id,event_id),
  FOREIGN KEY(restro_id,employee_id) REFERENCES employees(restro_id,id)
);
CREATE INDEX notification_reads_tenant ON notification_reads(restro_id,employee_id);
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON notification_reads
  USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid)
  WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT ON notification_reads TO dinerdost_app;
