ALTER TABLE employees ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE staff_invitations (
  id uuid PRIMARY KEY, restro_id uuid NOT NULL REFERENCES restaurants(id),
  invited_by uuid NOT NULL, email text NOT NULL, name text NOT NULL,
  role text NOT NULL CHECK(role IN ('MANAGER','CASHIER','WAITER','KITCHEN','ACCOUNTANT')),
  outlet_ids uuid[] NOT NULL, token_hash text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','ACCEPTED','REVOKED')),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  accepted_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(restro_id,invited_by) REFERENCES employees(restro_id,id),
  FOREIGN KEY(restro_id,accepted_by) REFERENCES employees(restro_id,id)
);
CREATE INDEX pending_staff_invites ON staff_invitations(restro_id,email) WHERE state='PENDING';
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON staff_invitations
  USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid)
  WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON staff_invitations TO dinerdost_app;
