-- Platform identities never require restaurant employees or tenant access.
CREATE TABLE platform_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_session_expiry ON platform_sessions(expires_at);
CREATE TABLE platform_enrolments (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES users(id),
 expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON platform_sessions,platform_enrolments FROM dinerdost_app;
