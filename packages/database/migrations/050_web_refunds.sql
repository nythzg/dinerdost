CREATE TABLE web_refund_requests (
 id uuid PRIMARY KEY,restro_id uuid NOT NULL,outlet_id uuid NOT NULL,order_id uuid NOT NULL,invoice_id uuid NOT NULL,
 amount bigint NOT NULL CHECK(amount>0),mode text NOT NULL CHECK(mode IN ('CASH','UPI','CARD','OTHER')),
 reason text NOT NULL,reference text NOT NULL DEFAULT '',requested_by uuid NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED')),
 version integer NOT NULL DEFAULT 1,decided_by uuid,decision_note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),decided_at timestamptz,
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,order_id) REFERENCES orders(restro_id,id),
 FOREIGN KEY(restro_id,invoice_id) REFERENCES invoices(restro_id,id),
 FOREIGN KEY(restro_id,requested_by) REFERENCES employees(restro_id,id),UNIQUE(restro_id,id)
);
CREATE TABLE web_refunds (
 id uuid PRIMARY KEY,restro_id uuid NOT NULL,outlet_id uuid NOT NULL,order_id uuid NOT NULL,invoice_id uuid NOT NULL,
 request_id uuid UNIQUE,amount bigint NOT NULL CHECK(amount>0),mode text NOT NULL CHECK(mode IN ('CASH','UPI','CARD','OTHER')),
 reason text NOT NULL,reference text NOT NULL DEFAULT '',allocations jsonb NOT NULL,snapshot jsonb NOT NULL,
 net_sales bigint NOT NULL,tax bigint NOT NULL,charges bigint NOT NULL,round_off bigint NOT NULL,
 recorded_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,order_id) REFERENCES orders(restro_id,id),
 FOREIGN KEY(restro_id,invoice_id) REFERENCES invoices(restro_id,id),
 FOREIGN KEY(restro_id,request_id) REFERENCES web_refund_requests(restro_id,id),
 FOREIGN KEY(restro_id,recorded_by) REFERENCES employees(restro_id,id),UNIQUE(restro_id,id)
);
CREATE INDEX web_refund_order ON web_refunds(order_id,created_at);
CREATE INDEX web_refund_approval ON web_refund_requests(outlet_id,state,created_at);
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['web_refund_requests','web_refunds'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING(restro_id=nullif(current_setting(''app.restro_id'',true),'''')::uuid) WITH CHECK(restro_id=nullif(current_setting(''app.restro_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO dinerdost_app',t);
 END LOOP;
END $$;
GRANT UPDATE ON web_refund_requests TO dinerdost_app;
CREATE TRIGGER immutable_web_refunds BEFORE UPDATE OR DELETE OR TRUNCATE ON web_refunds FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
