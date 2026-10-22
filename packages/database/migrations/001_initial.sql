DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='dinerdost_app') THEN CREATE ROLE dinerdost_app NOLOGIN; END IF; END; $$;

CREATE TABLE restaurants (
 id uuid PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
 currency text NOT NULL DEFAULT 'INR', is_demo boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 password_hash text NOT NULL, disabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE employees (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL REFERENCES restaurants(id),
 user_id uuid NOT NULL REFERENCES users(id), name text NOT NULL,
 role text NOT NULL CHECK(role IN ('OWNER','MANAGER','CASHIER','WAITER','KITCHEN','ACCOUNTANT')),
 outlet_ids uuid[] NOT NULL DEFAULT '{}', locale text NOT NULL DEFAULT 'en-IN',
 active boolean NOT NULL DEFAULT true, base_salary bigint NOT NULL DEFAULT 0 CHECK(base_salary>=0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(restro_id,user_id), UNIQUE(restro_id,id)
);
CREATE TABLE auth_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 employee_id uuid NOT NULL REFERENCES employees(id), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_expiry ON auth_sessions(expires_at);
CREATE TABLE rate_limits (key text PRIMARY KEY, attempts integer NOT NULL, reset_at timestamptz NOT NULL);

CREATE TABLE outlets (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL REFERENCES restaurants(id), name text NOT NULL,
 code text NOT NULL, address text NOT NULL DEFAULT '', gstin text NOT NULL DEFAULT '',
 qr_enabled boolean NOT NULL, payment_policy text NOT NULL CHECK(payment_policy IN ('PREPAID','MANAGER','POSTPAID')),
 tax_bps integer NOT NULL DEFAULT 500 CHECK(tax_bps BETWEEN 0 AND 10000),
 earn_bps integer NOT NULL DEFAULT 200 CHECK(earn_bps BETWEEN 0 AND 10000),
 otp_threshold bigint NOT NULL DEFAULT 20000, high_value_threshold bigint NOT NULL DEFAULT 100000,
 royalty_bps integer NOT NULL DEFAULT 0, marketing_bps integer NOT NULL DEFAULT 0,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(restro_id,id), UNIQUE(restro_id,code)
);
CREATE TABLE dining_tables (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 label text NOT NULL, seats integer NOT NULL CHECK(seats BETWEEN 1 AND 100),
 public_key text NOT NULL UNIQUE, floor text NOT NULL DEFAULT 'Main floor',
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id), UNIQUE(restro_id,id), UNIQUE(outlet_id,label)
);
CREATE TABLE table_sessions (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 table_id uuid NOT NULL, owner_employee_id uuid NOT NULL,
 parent_id uuid, label text NOT NULL DEFAULT 'MAIN', guests integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','BILLED','SETTLED','CLOSED')),
 opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,table_id) REFERENCES dining_tables(restro_id,id),
 FOREIGN KEY(restro_id,owner_employee_id) REFERENCES employees(restro_id,id),
 UNIQUE(restro_id,id)
);
CREATE UNIQUE INDEX one_open_table_session ON table_sessions(table_id,label) WHERE status <> 'CLOSED';
CREATE TABLE pairing_codes (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, session_id uuid NOT NULL,
 code_hash text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 FOREIGN KEY(restro_id,session_id) REFERENCES table_sessions(restro_id,id)
);
CREATE TABLE public_grants (
 token_hash text PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 session_id uuid, order_id uuid, device_hash text NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,session_id) REFERENCES table_sessions(restro_id,id)
);
CREATE TABLE menu_items (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 name text NOT NULL, category text NOT NULL, description text NOT NULL DEFAULT '',
 price bigint NOT NULL CHECK(price BETWEEN 0 AND 1000000000), tax_bps integer NOT NULL CHECK(tax_bps BETWEEN 0 AND 10000),
 unit text NOT NULL DEFAULT 'portion' CHECK(unit IN ('portion','kg','L')),
 station text NOT NULL DEFAULT 'Main kitchen', active boolean NOT NULL DEFAULT true,
 variants jsonb NOT NULL DEFAULT '[]', modifiers jsonb NOT NULL DEFAULT '[]',
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id), UNIQUE(restro_id,id)
);
CREATE TABLE ingredients (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 name text NOT NULL, unit text NOT NULL DEFAULT 'kg', reorder_milli bigint NOT NULL DEFAULT 0 CHECK(reorder_milli>=0),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id), UNIQUE(restro_id,id)
);
CREATE TABLE recipes (
 restro_id uuid NOT NULL, item_id uuid NOT NULL, ingredient_id uuid NOT NULL,
 quantity_milli integer NOT NULL CHECK(quantity_milli>0),
 FOREIGN KEY(restro_id,item_id) REFERENCES menu_items(restro_id,id),
 FOREIGN KEY(restro_id,ingredient_id) REFERENCES ingredients(restro_id,id), PRIMARY KEY(item_id,ingredient_id)
);
CREATE TABLE stock_batches (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 ingredient_id uuid NOT NULL, batch_number text NOT NULL,
 on_hand bigint NOT NULL CHECK(on_hand>=0), reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=on_hand),
 unit_cost bigint NOT NULL CHECK(unit_cost>=0), expires_on date, received_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,ingredient_id) REFERENCES ingredients(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id), UNIQUE(restro_id,id)
);
CREATE INDEX fifo_batches ON stock_batches(ingredient_id,received_at);
CREATE TABLE customers (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL REFERENCES restaurants(id), name text NOT NULL,
 phone text NOT NULL CHECK(phone ~ '^\+91[6-9][0-9]{9}$'), otp_verified boolean NOT NULL DEFAULT false,
 whatsapp_consent boolean NOT NULL DEFAULT false, marketing_consent boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(restro_id,phone), UNIQUE(restro_id,id)
);
CREATE TABLE orders (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 session_id uuid, customer_id uuid, customer_snapshot jsonb,
 number integer GENERATED BY DEFAULT AS IDENTITY, source text NOT NULL,
 type text NOT NULL DEFAULT 'DINE_IN', status text NOT NULL DEFAULT 'PENDING',
 version integer NOT NULL DEFAULT 1, bill_print_count integer NOT NULL DEFAULT 0,
 created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,session_id) REFERENCES table_sessions(restro_id,id),
 FOREIGN KEY(restro_id,customer_id) REFERENCES customers(restro_id,id), UNIQUE(restro_id,id)
);
CREATE TABLE order_rounds (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, order_id uuid NOT NULL,
 round_number integer NOT NULL, version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('DRAFT','PENDING','ACCEPTED','REJECTED','VOIDED')),
 course text NOT NULL DEFAULT 'IMMEDIATE' CHECK(course IN ('STARTER','MAIN','DESSERT','BEVERAGE','IMMEDIATE')),
 payment_status text NOT NULL DEFAULT 'REQUIRED', kot_status text NOT NULL DEFAULT 'HELD',
 subtotal bigint NOT NULL DEFAULT 0, discount bigint NOT NULL DEFAULT 0, tax bigint NOT NULL DEFAULT 0,
 payable bigint NOT NULL DEFAULT 0 CHECK(payable>=0), paid bigint NOT NULL DEFAULT 0 CHECK(paid>=0 AND paid<=payable),
 cogs bigint NOT NULL DEFAULT 0, quote_version integer, postpaid_authorized boolean NOT NULL DEFAULT false,
 rejection_reason text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,order_id) REFERENCES orders(restro_id,id), UNIQUE(restro_id,id), UNIQUE(order_id,round_number)
);
CREATE TABLE order_items (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, round_id uuid NOT NULL,
 item_id uuid NOT NULL, name text NOT NULL, unit_price bigint NOT NULL,
 quantity_milli integer NOT NULL CHECK(quantity_milli>0), tax_bps integer NOT NULL,
 station text NOT NULL, variant text, modifiers jsonb NOT NULL DEFAULT '[]', note text NOT NULL DEFAULT '',
 FOREIGN KEY(restro_id,round_id) REFERENCES order_rounds(restro_id,id),
 FOREIGN KEY(restro_id,item_id) REFERENCES menu_items(restro_id,id)
);
CREATE TABLE stock_reservations (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, round_id uuid NOT NULL, batch_id uuid NOT NULL,
 quantity_milli bigint NOT NULL CHECK(quantity_milli>0), state text NOT NULL DEFAULT 'RESERVED',
 FOREIGN KEY(restro_id,round_id) REFERENCES order_rounds(restro_id,id),
 FOREIGN KEY(restro_id,batch_id) REFERENCES stock_batches(restro_id,id), UNIQUE(round_id,batch_id)
);
CREATE TABLE stock_movements (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 ingredient_id uuid NOT NULL, batch_id uuid, round_id uuid, kind text NOT NULL,
 delta_milli bigint NOT NULL, cost bigint NOT NULL DEFAULT 0, reason text NOT NULL,
 actor_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,ingredient_id) REFERENCES ingredients(restro_id,id)
);
CREATE TABLE payment_attempts (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 order_id uuid NOT NULL, round_id uuid NOT NULL, method text NOT NULL,
 amount bigint NOT NULL CHECK(amount>0), state text NOT NULL DEFAULT 'AWAITING_VERIFICATION',
 order_version integer NOT NULL, reference text, verified_by uuid, verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,order_id) REFERENCES orders(restro_id,id),
 FOREIGN KEY(restro_id,round_id) REFERENCES order_rounds(restro_id,id), UNIQUE(restro_id,id)
);
CREATE UNIQUE INDEX unique_verified_reference ON payment_attempts(restro_id,method,reference) WHERE state='VERIFIED' AND reference IS NOT NULL;
CREATE TABLE coupons (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 code text NOT NULL, discount_amount bigint NOT NULL CHECK(discount_amount>0),
 minimum_amount bigint NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL,
 customer_id uuid, state text NOT NULL DEFAULT 'AVAILABLE', round_id uuid,
 round_version integer, reserved_until timestamptz,
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id), UNIQUE(restro_id,code), UNIQUE(restro_id,id)
);
CREATE TABLE loyalty_ledger (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 customer_id uuid NOT NULL, order_id uuid NOT NULL, round_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('PENDING_EARN','EARNED','REDEEMED','EXPIRED','REVERSED')),
 points bigint NOT NULL, settlement_ref uuid, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,customer_id) REFERENCES customers(restro_id,id), UNIQUE(round_id,state)
);
CREATE TABLE invoices (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 order_id uuid NOT NULL, number text NOT NULL, document_type text NOT NULL,
 snapshot jsonb NOT NULL, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,order_id) REFERENCES orders(restro_id,id), UNIQUE(restro_id,number), UNIQUE(restro_id,id)
);
CREATE UNIQUE INDEX one_final_invoice ON invoices(order_id) WHERE document_type='FINAL_TAX_INVOICE';
CREATE TABLE kot_tickets (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 order_id uuid NOT NULL, round_id uuid NOT NULL, station text NOT NULL,
 status text NOT NULL DEFAULT 'RELEASED', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,round_id) REFERENCES order_rounds(restro_id,id), UNIQUE(round_id,station), UNIQUE(restro_id,id)
);
CREATE TABLE service_requests (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, session_id uuid NOT NULL,
 kind text NOT NULL, owner_id uuid, state text NOT NULL DEFAULT 'OPEN',
 created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz, completed_at timestamptz,
 FOREIGN KEY(restro_id,session_id) REFERENCES table_sessions(restro_id,id), UNIQUE(restro_id,id)
);
CREATE UNIQUE INDEX one_active_service_request ON service_requests(session_id,kind) WHERE state IN ('OPEN','ACCEPTED','ESCALATED');
CREATE TABLE records (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 kind text NOT NULL, title text NOT NULL, state text NOT NULL DEFAULT 'DRAFT',
 data jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL, approved_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id), UNIQUE(restro_id,id)
);
CREATE INDEX record_kind ON records(restro_id,kind,outlet_id);
CREATE TABLE notifications (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 event text NOT NULL, order_id uuid, customer_id uuid, channel text NOT NULL DEFAULT 'WHATSAPP',
 state text NOT NULL DEFAULT 'NOT_CONFIGURED', payload jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid,
 sequence bigint NOT NULL, actor_id text NOT NULL, actor_name text NOT NULL, actor_role text NOT NULL,
 auth_method text NOT NULL, action text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
 old_state jsonb, new_state jsonb, reason text NOT NULL, financial_impact bigint NOT NULL DEFAULT 0,
 risk text NOT NULL DEFAULT 'INFO', table_id uuid, device_id text, ip text,
 occurred_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 previous_hash text NOT NULL, record_hash text NOT NULL, UNIQUE(restro_id,sequence)
);
CREATE INDEX audit_query ON audit_events(restro_id,outlet_id,recorded_at DESC);
CREATE TABLE audit_heads (restro_id uuid PRIMARY KEY REFERENCES restaurants(id), sequence bigint NOT NULL DEFAULT 0, hash text NOT NULL DEFAULT 'GENESIS');
CREATE TABLE idempotency_keys (
 restro_id uuid NOT NULL, key text NOT NULL, actor_id text NOT NULL, fingerprint text NOT NULL,
 response jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(restro_id,key)
);
CREATE TABLE outbox (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, topic text NOT NULL, payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'PENDING', attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION block_immutable_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_RECORD: issued documents and audit records cannot be changed'; END; $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
CREATE TRIGGER immutable_invoice BEFORE UPDATE OR DELETE OR TRUNCATE ON invoices FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
CREATE TRIGGER immutable_stock_movement BEFORE UPDATE OR DELETE OR TRUNCATE ON stock_movements FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();

CREATE FUNCTION enforce_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='SETTLED' AND (NEW.customer_id IS NULL OR NEW.customer_snapshot IS NULL OR coalesce(NEW.customer_snapshot->>'name','')='') THEN
  RAISE EXCEPTION 'IDENTITY_REQUIRED: customer name and phone are required for settlement';
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER order_identity_gate BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION enforce_identity();
CREATE FUNCTION payment_identity_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM orders o JOIN customers c ON c.id=o.customer_id AND c.restro_id=o.restro_id WHERE o.id=NEW.order_id AND o.restro_id=NEW.restro_id AND c.name<>'' AND c.phone ~ '^\+91[6-9][0-9]{9}$') THEN
  RAISE EXCEPTION 'IDENTITY_REQUIRED: payment cannot start without customer identity';
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER enforce_payment_identity BEFORE INSERT ON payment_attempts FOR EACH ROW EXECUTE FUNCTION payment_identity_gate();
CREATE FUNCTION kot_authority_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM order_rounds r JOIN orders o ON o.id=r.order_id AND o.restro_id=r.restro_id JOIN outlets t ON t.id=o.outlet_id AND t.restro_id=o.restro_id WHERE r.id=NEW.round_id AND r.restro_id=NEW.restro_id AND r.status='ACCEPTED' AND ((r.paid=r.payable AND r.payable>0) OR (r.payable=0 AND r.quote_version=r.version) OR (t.payment_policy='POSTPAID' AND r.postpaid_authorized=true))) THEN
  RAISE EXCEPTION 'KOT_NOT_AUTHORIZED: transaction control has not authorized this round';
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER enforce_kot_authority BEFORE INSERT ON kot_tickets FOR EACH ROW EXECUTE FUNCTION kot_authority_gate();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['employees','outlets','dining_tables','table_sessions','pairing_codes','public_grants','menu_items','ingredients','recipes','stock_batches','customers','orders','order_rounds','order_items','stock_reservations','stock_movements','payment_attempts','coupons','loyalty_ledger','invoices','kot_tickets','service_requests','records','notifications','audit_events','audit_heads','idempotency_keys','outbox'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING (restro_id = nullif(current_setting(''app.restro_id'',true),'''')::uuid) WITH CHECK (restro_id = nullif(current_setting(''app.restro_id'',true),'''')::uuid)',t);
 END LOOP;
END; $$;

GRANT USAGE ON SCHEMA public TO dinerdost_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO dinerdost_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO dinerdost_app;
REVOKE UPDATE,DELETE,TRUNCATE ON audit_events,invoices,stock_movements FROM dinerdost_app;
REVOKE ALL ON auth_sessions,rate_limits,users FROM dinerdost_app;
