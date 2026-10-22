CREATE TABLE customer_devices (
 restro_id uuid NOT NULL, outlet_id uuid NOT NULL, device_hash text NOT NULL CHECK(device_hash ~ '^[a-f0-9]{64}$'),
 banned_until timestamptz, ban_reason text, banned_by uuid, banned_from_order_id uuid,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(restro_id,outlet_id,device_hash),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,banned_by) REFERENCES employees(restro_id,id),
 FOREIGN KEY(restro_id,banned_from_order_id) REFERENCES orders(restro_id,id)
);
CREATE TABLE customer_order_devices (
 order_id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, device_hash text NOT NULL,
 FOREIGN KEY(restro_id,order_id) REFERENCES orders(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id,device_hash) REFERENCES customer_devices(restro_id,outlet_id,device_hash)
);
INSERT INTO customer_devices(restro_id,outlet_id,device_hash)
 SELECT DISTINCT restro_id,outlet_id,device_hash FROM public_grants ON CONFLICT DO NOTHING;
INSERT INTO customer_order_devices(order_id,restro_id,outlet_id,device_hash)
 SELECT DISTINCT ON(g.order_id) g.order_id,g.restro_id,g.outlet_id,g.device_hash
 FROM public_grants g JOIN orders o ON o.id=g.order_id AND o.restro_id=g.restro_id AND o.outlet_id=g.outlet_id
 ORDER BY g.order_id,g.expires_at DESC ON CONFLICT DO NOTHING;
ALTER TABLE customer_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_devices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON customer_devices USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
ALTER TABLE customer_order_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_devices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON customer_order_devices USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON customer_devices TO dinerdost_app;
GRANT SELECT,INSERT ON customer_order_devices TO dinerdost_app;

-- Also capture orders written by the previous app version during rollout.
CREATE FUNCTION bind_customer_order_device() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.order_id IS NOT NULL THEN
  INSERT INTO customer_devices(restro_id,outlet_id,device_hash)
   VALUES(NEW.restro_id,NEW.outlet_id,NEW.device_hash) ON CONFLICT DO NOTHING;
  INSERT INTO customer_order_devices(order_id,restro_id,outlet_id,device_hash)
   SELECT id,restro_id,outlet_id,NEW.device_hash FROM orders
   WHERE id=NEW.order_id AND restro_id=NEW.restro_id AND outlet_id=NEW.outlet_id
   ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER customer_order_device_binding AFTER INSERT OR UPDATE OF order_id ON public_grants
 FOR EACH ROW EXECUTE FUNCTION bind_customer_order_device();
