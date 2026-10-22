ALTER TABLE audit_events ADD CONSTRAINT audit_event_tenant_identity UNIQUE(restro_id,id);
-- Owner red flags may concern tenant-wide access changes.
ALTER TABLE notifications ALTER COLUMN outlet_id DROP NOT NULL;
CREATE TABLE push_devices (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL REFERENCES restaurants(id), employee_id uuid NOT NULL,
 session_hash text NOT NULL REFERENCES auth_sessions(token_hash) ON DELETE CASCADE,
 application text NOT NULL CHECK(application IN ('MASTER','POS','CAPTAIN','KITCHEN','BAR','COMMAND')),
 outlet_id uuid NOT NULL, fid text NOT NULL, fid_hash text NOT NULL UNIQUE, binding_id uuid NOT NULL,
 cursor bigint NOT NULL DEFAULT 0, enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,employee_id) REFERENCES employees(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id), UNIQUE(restro_id,id)
);
CREATE TABLE push_deliveries (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, device_id uuid NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
 binding_id uuid NOT NULL, event_id uuid NOT NULL, outlet_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENDING','SENT','CANCELLED','FAILED')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 lease_id uuid, lease_until timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 FOREIGN KEY(restro_id,event_id) REFERENCES audit_events(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 UNIQUE(device_id,binding_id,event_id)
);
CREATE INDEX push_pending ON push_deliveries(available_at) WHERE state IN ('PENDING','SENDING');
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['push_devices','push_deliveries'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON %I USING(restro_id=nullif(current_setting(''app.restro_id'',true),'''')::uuid) WITH CHECK(restro_id=nullif(current_setting(''app.restro_id'',true),'''')::uuid)',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO dinerdost_app',t);
END LOOP; END $$;
