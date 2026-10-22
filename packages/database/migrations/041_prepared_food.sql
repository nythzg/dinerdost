-- Operational prepared stock; historical order costs and raw movements stay immutable.
ALTER TABLE order_items ADD CONSTRAINT order_items_tenant_id UNIQUE(restro_id,id);
CREATE TABLE prepared_food_batches (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 source_order_id uuid NOT NULL, source_round_id uuid NOT NULL, source_item_id uuid NOT NULL,
 quantity_milli bigint NOT NULL CHECK(quantity_milli>0),
 on_hand bigint NOT NULL CHECK(on_hand>=0), reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=on_hand),
 remaining_value bigint CHECK(remaining_value>=0), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,source_order_id) REFERENCES orders(restro_id,id),
 FOREIGN KEY(restro_id,source_round_id) REFERENCES order_rounds(restro_id,id),
 FOREIGN KEY(restro_id,source_item_id) REFERENCES order_items(restro_id,id),
 UNIQUE(restro_id,id), UNIQUE(source_item_id)
);
ALTER TABLE menu_items ADD COLUMN ready_food_batch_id uuid;
ALTER TABLE menu_items ADD CONSTRAINT ready_food_batch_tenant FOREIGN KEY(restro_id,ready_food_batch_id) REFERENCES prepared_food_batches(restro_id,id);
CREATE UNIQUE INDEX one_ready_menu_item ON menu_items(ready_food_batch_id) WHERE ready_food_batch_id IS NOT NULL;
CREATE TABLE prepared_food_reservations (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, batch_id uuid NOT NULL, round_id uuid NOT NULL,
 order_item_id uuid NOT NULL, quantity_milli bigint NOT NULL CHECK(quantity_milli>0),
 state text NOT NULL CHECK(state IN ('RESERVED','CONSUMED','RELEASED','EXPIRED')),
 consumed_value bigint CHECK(consumed_value>=0),
 FOREIGN KEY(restro_id,batch_id) REFERENCES prepared_food_batches(restro_id,id),
 FOREIGN KEY(restro_id,round_id) REFERENCES order_rounds(restro_id,id),
 FOREIGN KEY(restro_id,order_item_id) REFERENCES order_items(restro_id,id) ON DELETE CASCADE,
 UNIQUE(order_item_id)
);
CREATE TABLE prepared_food_movements (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, batch_id uuid,
 round_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('REALLOCATION','CONSUMPTION','WASTAGE')),
 delta_milli bigint NOT NULL, cost bigint CHECK(cost>=0), reason text NOT NULL, actor_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,batch_id) REFERENCES prepared_food_batches(restro_id,id),
 FOREIGN KEY(restro_id,round_id) REFERENCES order_rounds(restro_id,id)
);
CREATE INDEX ready_food_expiry ON prepared_food_batches(outlet_id,expires_at) WHERE on_hand>0;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['prepared_food_batches','prepared_food_reservations','prepared_food_movements'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON %I USING(restro_id=nullif(current_setting(''app.restro_id'',true),'''')::uuid) WITH CHECK(restro_id=nullif(current_setting(''app.restro_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON prepared_food_batches TO dinerdost_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON prepared_food_reservations TO dinerdost_app;
GRANT SELECT,INSERT ON prepared_food_movements TO dinerdost_app;
CREATE TRIGGER immutable_prepared_food_movements BEFORE UPDATE OR DELETE OR TRUNCATE ON prepared_food_movements FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
