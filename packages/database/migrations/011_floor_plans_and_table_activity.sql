ALTER TABLE table_sessions ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX idle_table_sessions ON table_sessions(outlet_id,last_activity_at) WHERE status<>'CLOSED';

CREATE TABLE floor_plans (
  id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
  floor text NOT NULL, objects jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(objects)='array'),
  version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(outlet_id,floor), UNIQUE(restro_id,id),
  FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id)
);
ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON floor_plans
  USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid)
  WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON floor_plans TO dinerdost_app;

-- Only business writes touch activity. Read/poll requests never extend a visit.
CREATE FUNCTION touch_order_session_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE table_sessions SET last_activity_at=now()
    WHERE id=NEW.session_id AND restro_id=NEW.restro_id AND status<>'CLOSED';
  RETURN NEW;
END; $$;
CREATE TRIGGER order_session_activity AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION touch_order_session_activity();

CREATE FUNCTION touch_round_session_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE table_sessions s SET last_activity_at=now() FROM orders o
    WHERE o.id=NEW.order_id AND o.restro_id=NEW.restro_id
      AND s.id=o.session_id AND s.restro_id=o.restro_id AND s.status<>'CLOSED';
  RETURN NEW;
END; $$;
CREATE TRIGGER round_session_activity AFTER INSERT OR UPDATE ON order_rounds
  FOR EACH ROW EXECUTE FUNCTION touch_round_session_activity();

CREATE FUNCTION touch_service_session_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE table_sessions SET last_activity_at=now() WHERE restro_id=NEW.restro_id
    AND status<>'CLOSED' AND (id=NEW.session_id OR (NEW.session_id IS NULL AND table_id=NEW.table_id));
  RETURN NEW;
END; $$;
CREATE TRIGGER service_session_activity AFTER INSERT OR UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION touch_service_session_activity();

CREATE FUNCTION touch_moved_session_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.last_activity_at=now();
  RETURN NEW;
END; $$;
CREATE TRIGGER moved_session_activity BEFORE UPDATE OF table_id,guests,owner_employee_id,label ON table_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_moved_session_activity();
