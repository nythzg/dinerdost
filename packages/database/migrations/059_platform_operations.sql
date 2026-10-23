-- Additive local web operations. No existing tenant, invoice, payment or stock rows are changed.
ALTER TABLE platform_members ADD COLUMN tenant_scope uuid[], ADD COLUMN region text NOT NULL DEFAULT '';
CREATE TABLE platform_operational_config(key text PRIMARY KEY,data jsonb NOT NULL,version integer NOT NULL DEFAULT 1,updated_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_brand_access(brand_id uuid NOT NULL REFERENCES platform_records(id),user_id uuid NOT NULL REFERENCES users(id),enabled boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,PRIMARY KEY(brand_id,user_id));
CREATE TABLE platform_assets(id uuid PRIMARY KEY,brand_id uuid NOT NULL REFERENCES platform_records(id),mime text NOT NULL CHECK(mime IN('image/png','image/jpeg')),bytes bytea NOT NULL CHECK(octet_length(bytes)<=2097152),sha256 text NOT NULL,uploaded_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_tenant_setup(restro_id uuid PRIMARY KEY REFERENCES restaurants(id),taxonomies jsonb NOT NULL DEFAULT '[]',role_templates jsonb NOT NULL DEFAULT '[]',branding jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1);
CREATE TABLE platform_menu_tags(restro_id uuid NOT NULL REFERENCES restaurants(id),item_id uuid NOT NULL,tag_id uuid NOT NULL REFERENCES platform_records(id),snapshot jsonb NOT NULL,PRIMARY KEY(item_id,tag_id),FOREIGN KEY(restro_id,item_id) REFERENCES menu_items(restro_id,id));
CREATE TABLE platform_billing_profiles(restro_id uuid PRIMARY KEY REFERENCES restaurants(id),data jsonb NOT NULL,version integer NOT NULL DEFAULT 1);
CREATE TABLE platform_subscription_automation(subscription_id uuid PRIMARY KEY REFERENCES platform_records(id),restro_id uuid NOT NULL REFERENCES restaurants(id),enabled boolean NOT NULL DEFAULT false,data jsonb NOT NULL,state jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1);
CREATE TABLE platform_contract_history(id uuid PRIMARY KEY,subscription_id uuid NOT NULL REFERENCES platform_records(id),restro_id uuid NOT NULL REFERENCES restaurants(id),snapshot jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX platform_contract_history_lookup ON platform_contract_history(subscription_id,recorded_at DESC);
CREATE TABLE platform_saas_documents(id uuid PRIMARY KEY,restro_id uuid NOT NULL REFERENCES restaurants(id),subscription_id uuid REFERENCES platform_records(id),kind text NOT NULL CHECK(kind IN('INVOICE','CREDIT')),number text NOT NULL CHECK(length(number)<=16),financial_year text NOT NULL,period_start date NOT NULL,period_end date NOT NULL,due_on date NOT NULL,total bigint NOT NULL CHECK(total>=0),snapshot jsonb NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(financial_year,number),UNIQUE(subscription_id,period_start,kind));
CREATE TABLE platform_saas_payments(id uuid PRIMARY KEY,restro_id uuid NOT NULL REFERENCES restaurants(id),invoice_id uuid NOT NULL REFERENCES platform_saas_documents(id),amount bigint NOT NULL CHECK(amount>0),method text NOT NULL,reference text NOT NULL,paid_on date NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(restro_id,reference));
CREATE TABLE platform_fee_accruals(id uuid PRIMARY KEY,restro_id uuid NOT NULL REFERENCES restaurants(id),rule_id uuid NOT NULL REFERENCES platform_records(id),source_kind text NOT NULL,source_id uuid NOT NULL,amount bigint NOT NULL CHECK(amount>=0),snapshot jsonb NOT NULL,occurred_on date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(rule_id,source_id));
CREATE TABLE platform_settlement_entries(id uuid PRIMARY KEY,restro_id uuid NOT NULL REFERENCES restaurants(id),direction text NOT NULL CHECK(direction IN('RECEIVED','PAYOUT')),amount bigint NOT NULL CHECK(amount>0),reference text NOT NULL,occurred_on date NOT NULL,reason text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(restro_id,reference));
CREATE TABLE platform_notifications(id uuid PRIMARY KEY,restro_id uuid NOT NULL REFERENCES restaurants(id),source_key text NOT NULL UNIQUE,title text NOT NULL,message text NOT NULL,visible_after timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_tasks(id uuid PRIMARY KEY,restro_id uuid REFERENCES restaurants(id),source_key text NOT NULL UNIQUE,kind text NOT NULL,state text NOT NULL DEFAULT 'OPEN' CHECK(state IN('OPEN','IN_PROGRESS','RESOLVED')),data jsonb NOT NULL,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_case_details(ticket_id uuid PRIMARY KEY REFERENCES platform_records(id),restro_id uuid REFERENCES restaurants(id),data jsonb NOT NULL,due_at timestamptz NOT NULL,escalated_at timestamptz,version integer NOT NULL DEFAULT 1);
CREATE TABLE platform_case_attachments(id uuid PRIMARY KEY,ticket_id uuid NOT NULL REFERENCES platform_records(id),name text NOT NULL,mime text NOT NULL,bytes bytea NOT NULL CHECK(octet_length(bytes)<=2097152),sha256 text NOT NULL,uploaded_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_qr_events(id uuid PRIMARY KEY,restro_id uuid NOT NULL REFERENCES restaurants(id),table_id uuid NOT NULL REFERENCES dining_tables(id),action text NOT NULL,previous_key_hash text,new_key_hash text,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_http_samples(id uuid PRIMARY KEY,route text NOT NULL,status integer NOT NULL,latency_ms integer NOT NULL CHECK(latency_ms>=0),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX platform_http_samples_time ON platform_http_samples(created_at);
CREATE TABLE platform_db_samples(id uuid PRIMARY KEY,latency_ms integer NOT NULL,connections integer,database_bytes bigint,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_maintenance_runs(id uuid PRIMARY KEY,state text NOT NULL,summary jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['platform_operational_config','platform_brand_access','platform_assets','platform_tenant_setup','platform_menu_tags','platform_billing_profiles','platform_subscription_automation','platform_contract_history','platform_saas_documents','platform_saas_payments','platform_fee_accruals','platform_settlement_entries','platform_notifications','platform_tasks','platform_case_details','platform_case_attachments','platform_qr_events','platform_http_samples','platform_db_samples','platform_maintenance_runs'] LOOP
  EXECUTE format('REVOKE ALL ON %I FROM dinerdost_app',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['platform_assets','platform_contract_history','platform_saas_documents','platform_saas_payments','platform_fee_accruals','platform_settlement_entries','platform_case_attachments','platform_qr_events'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation()',t||'_immutable',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['platform_tenant_setup','platform_menu_tags'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_own ON %I USING(restro_id=nullif(current_setting(''app.restro_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT ON %I TO dinerdost_app',t);
 END LOOP;
END $$;
CREATE FUNCTION platform_current_notices() RETURNS TABLE(id uuid,name text,data jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT n.id,n.title,jsonb_build_object('message',n.message,'level','WARNING') FROM public.platform_notifications n WHERE n.restro_id=nullif(current_setting('app.restro_id',true),'')::uuid AND n.visible_after<=now() AND n.resolved_at IS NULL ORDER BY n.created_at DESC LIMIT 10
$$;
REVOKE ALL ON FUNCTION platform_current_notices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_current_notices() TO dinerdost_app;
