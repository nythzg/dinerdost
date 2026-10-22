CREATE TABLE calculator_history (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, employee_id uuid NOT NULL,
 expression text NOT NULL CHECK(length(expression) BETWEEN 1 AND 200),
 result text NOT NULL CHECK(length(result) BETWEEN 1 AND 100),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,employee_id) REFERENCES employees(restro_id,id)
);
CREATE INDEX calculator_history_actor ON calculator_history(restro_id,employee_id,created_at DESC,id DESC);
ALTER TABLE calculator_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculator_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON calculator_history USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON calculator_history TO dinerdost_app;
