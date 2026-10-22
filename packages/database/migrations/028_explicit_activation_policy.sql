-- The previous release always required staff approval, even if this dormant
-- legacy flag was true. Keep that effective policy until management opts in.
UPDATE outlets SET qr_auto_activate=false,version=version+1 WHERE qr_auto_activate;
