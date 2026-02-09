alter table if exists public.settings
  add column if not exists email_alert_recipient text;
