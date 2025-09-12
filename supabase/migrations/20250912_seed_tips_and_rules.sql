-- Seed Tips Library and a default Notification Rule

-- Tips (id generated; use code as unique key)
insert into public.tips_library (code, title, body_md, metric_keys, severity)
values
  ('improve_price_elastic', 'Price likely impacting rank',
   'Your price has a positive elasticity vs. rank (higher price → worse rank).\n\nTry: small A/B test of -5% price for 3–5 days and monitor momentum and revenue.',
   array['elasticity_est','momentum_7','volatility_30'], 'warning')
  on conflict (code) do update set
    title = excluded.title,
    body_md = excluded.body_md,
    metric_keys = excluded.metric_keys,
    severity = excluded.severity;

insert into public.tips_library (code, title, body_md, metric_keys, severity)
values
  ('low_qi_recovery', 'Recover your best historical performance',
   'QI is well below your historical best.\n\nTry: review cover/keywords; check for stock issues; consider small promo to regain rank.',
   array['qi_score','baseline_percentile'], 'info')
  on conflict (code) do update set
    title = excluded.title,
    body_md = excluded.body_md,
    metric_keys = excluded.metric_keys,
    severity = excluded.severity;

-- Default notification rule (user must replace <USER_ID>)
-- Fires when QI < 40 and momentum_7 deteriorates (> 0.02), attaches the 'low_qi_recovery' tip.
-- Change channels as desired.
-- Example condition JSON:
-- {
--   "all": [
--     {"metric":"qi_score","op":"lt","value":40},
--     {"metric":"momentum_7","op":"gt","value":0.02},
--     {"tip_code":"low_qi_recovery"}
--   ]
-- }

-- Replace this with the real user id before executing, or run via an app-side insert.
-- insert into public.notification_rules (user_id, name, rule_type, condition, cooloff_seconds, channels, enabled)
-- values (
--   '00000000-0000-0000-0000-000000000000',
--   'Low QI + Losing momentum',
--   'threshold',
--   '{"all":[{"metric":"qi_score","op":"lt","value":40},{"metric":"momentum_7","op":"gt","value":0.02},{"tip_code":"low_qi_recovery"}]}',
--   21600,
--   array['inapp','email']::text[],
--   true
-- );
