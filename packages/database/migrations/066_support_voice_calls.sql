CREATE TABLE platform_support_calls(
 id uuid PRIMARY KEY,
 thread_id uuid NOT NULL REFERENCES platform_support_threads(id),
 caller_id uuid NOT NULL REFERENCES users(id),
 caller_name text NOT NULL,
 caller_side text NOT NULL CHECK(caller_side IN('RESTAURANT','SUPPORT')),
 answered_by uuid REFERENCES users(id),
 state text NOT NULL CHECK(state IN('RINGING','ANSWERED','DECLINED','ENDED')),
 offer text NOT NULL CHECK(length(offer) BETWEEN 1 AND 48000),
 answer text CHECK(length(answer) BETWEEN 1 AND 48000),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 ended_at timestamptz
);
CREATE UNIQUE INDEX platform_support_calls_active ON platform_support_calls(thread_id) WHERE state IN('RINGING','ANSWERED');
REVOKE ALL ON platform_support_calls FROM dinerdost_app;
