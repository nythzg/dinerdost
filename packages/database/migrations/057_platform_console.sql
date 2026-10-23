-- Platform administration is deliberately outside the tenant SQL role.
CREATE TABLE platform_members (
 user_id uuid PRIMARY KEY REFERENCES users(id), role text NOT NULL CHECK(role IN ('SUPERADMIN','ONBOARDING','BILLING','SUPPORT','SALES','ANALYST','CUSTOM')),
 permissions text[] NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_records (
 id uuid PRIMARY KEY, kind text NOT NULL, name text NOT NULL, tenant_id uuid REFERENCES restaurants(id),
 data jsonb NOT NULL DEFAULT '{}', archived boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_records_kind ON platform_records(kind,tenant_id);
CREATE TABLE platform_tenant_policies (
 restro_id uuid PRIMARY KEY REFERENCES restaurants(id), status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','HOLD','SUSPENDED','TERMINATED')),
 kyc text NOT NULL DEFAULT 'UNREVIEWED' CHECK(kyc IN ('UNREVIEWED','VERIFIED','REJECTED')),
 brand_id uuid REFERENCES platform_records(id), plan_id uuid REFERENCES platform_records(id),
 features jsonb, staff_limit integer CHECK(staff_limit IS NULL OR staff_limit>=1), outlet_limit integer CHECK(outlet_limit IS NULL OR outlet_limit>=1), order_limit integer CHECK(order_limit IS NULL OR order_limit>=1),
 details jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_tenant_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_tenant_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_tenant_read ON platform_tenant_policies USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT ON platform_tenant_policies TO dinerdost_app;
CREATE FUNCTION platform_lock_own_policy() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 SELECT to_jsonb(p) INTO result FROM public.platform_tenant_policies p WHERE restro_id=nullif(current_setting('app.restro_id',true),'')::uuid FOR UPDATE;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION platform_lock_own_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_lock_own_policy() TO dinerdost_app;
CREATE TABLE platform_audit_head (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), sequence bigint NOT NULL DEFAULT 0, hash text NOT NULL DEFAULT '');
INSERT INTO platform_audit_head(singleton) VALUES(true);
CREATE TABLE platform_audit (
 id uuid PRIMARY KEY, sequence bigint NOT NULL UNIQUE, actor_user_id uuid REFERENCES users(id), actor_name text NOT NULL,
 action text NOT NULL, entity_id text NOT NULL, reason text NOT NULL, ip text,
 before_data jsonb, after_data jsonb, occurred_at timestamptz NOT NULL,
 previous_hash text NOT NULL, record_hash text NOT NULL
);
CREATE TRIGGER platform_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON platform_audit FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
CREATE TABLE platform_requests (user_id uuid NOT NULL REFERENCES users(id), key text NOT NULL, fingerprint text NOT NULL, response jsonb, PRIMARY KEY(user_id,key));
CREATE TABLE platform_support_access (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), restro_id uuid NOT NULL REFERENCES restaurants(id), session_hash text NOT NULL,
 reason text NOT NULL, expires_at timestamptz NOT NULL, ended_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON platform_members,platform_records,platform_audit_head,platform_audit,platform_requests,platform_support_access FROM dinerdost_app;

CREATE TRIGGER platform_billing_immutable BEFORE UPDATE OR DELETE ON platform_records FOR EACH ROW WHEN(OLD.kind='BILLING') EXECUTE FUNCTION block_immutable_mutation();
CREATE TRIGGER platform_records_no_truncate BEFORE TRUNCATE ON platform_records FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
CREATE FUNCTION platform_current_broadcasts() RETURNS TABLE(id uuid,name text,data jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT r.id,r.name,r.data FROM public.platform_records r WHERE r.kind='BROADCAST' AND NOT r.archived AND r.data->>'published'='true'
 AND (r.tenant_id IS NULL OR r.tenant_id=nullif(current_setting('app.restro_id',true),'')::uuid)
 AND (r.data->>'startsAt')::timestamptz<=now() AND (r.data->>'endsAt')::timestamptz>now()
 ORDER BY r.created_at DESC LIMIT 5
$$;
REVOKE ALL ON FUNCTION platform_current_broadcasts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_current_broadcasts() TO dinerdost_app;

CREATE TABLE platform_documents (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL REFERENCES restaurants(id), name text NOT NULL, mime text NOT NULL,
 bytes bytea NOT NULL CHECK(octet_length(bytes)<=2097152), sha256 text NOT NULL, uploaded_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_promo_redemptions (
 promo_id uuid NOT NULL REFERENCES platform_records(id), restro_id uuid NOT NULL REFERENCES restaurants(id),
 billing_id uuid NOT NULL UNIQUE REFERENCES platform_records(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(promo_id,restro_id)
);
REVOKE ALL ON platform_documents,platform_promo_redemptions FROM dinerdost_app;
CREATE TRIGGER platform_documents_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON platform_documents FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
CREATE TRIGGER platform_promo_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON platform_promo_redemptions FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
