-- Support conversations are private platform records, never restaurant-wide data.
CREATE TABLE platform_support_threads(
 id uuid PRIMARY KEY REFERENCES platform_records(id),
 restro_id uuid NOT NULL REFERENCES restaurants(id),
 employee_id uuid NOT NULL REFERENCES employees(id),
 outlet_id uuid NOT NULL REFERENCES outlets(id),
 queue text NOT NULL CHECK(queue IN('TECHNICAL','BILLING','ACCOUNT','GENERAL')),
 assigned_to uuid REFERENCES platform_members(user_id)
);
CREATE TABLE platform_support_messages(
 id uuid PRIMARY KEY,
 thread_id uuid NOT NULL REFERENCES platform_support_threads(id),
 sender_id uuid NOT NULL REFERENCES users(id),
 sender_name text NOT NULL,
 side text NOT NULL CHECK(side IN('RESTAURANT','SUPPORT')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_support_messages_thread ON platform_support_messages(thread_id,created_at,id);
CREATE INDEX platform_support_threads_restaurant ON platform_support_threads(restro_id,employee_id);
REVOKE ALL ON platform_support_threads,platform_support_messages FROM dinerdost_app;
CREATE TRIGGER platform_support_messages_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON platform_support_messages FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
