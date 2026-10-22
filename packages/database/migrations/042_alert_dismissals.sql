CREATE TABLE ui_alert_dismissals (
 restro_id uuid NOT NULL, employee_id uuid NOT NULL, outlet_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('STOCK','OVERVIEW')), state_key text NOT NULL CHECK(length(state_key) BETWEEN 1 AND 200),
 dismissed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(employee_id,outlet_id,kind,state_key),
 FOREIGN KEY(restro_id,employee_id) REFERENCES employees(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id)
);
ALTER TABLE ui_alert_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_alert_dismissals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ui_alert_dismissals USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT ON ui_alert_dismissals TO dinerdost_app;
