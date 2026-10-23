-- Future web claims use the outlet name; prior claims keep their own snapshot.
ALTER TABLE outlets ADD COLUMN web_loyalty_name text NOT NULL DEFAULT 'Loyalty'
 CHECK(length(btrim(web_loyalty_name)) BETWEEN 1 AND 80);
ALTER TABLE loyalty_reservations ADD COLUMN web_reward_name text
 CHECK(web_reward_name IS NULL OR length(btrim(web_reward_name)) BETWEEN 1 AND 80);
