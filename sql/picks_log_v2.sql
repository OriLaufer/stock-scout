-- MIGRATION 2 — run this after picks_log.sql, in the Supabase SQL editor.
--
-- Only the newest scan carries a full shortlist; three carry an entry zone.
-- Rising Stars, however, is present in EVERY scan going back months. It does
-- not have the conviction breakdown, but it has a ticker and the price we saw
-- it at — which is enough to measure whether our picks actually made money,
-- months earlier than waiting for new picks to ripen.
--
-- These columns record which list a row came from (so the two are never mixed
-- in an analysis) and the two facts Rising Stars carries that are worth testing
-- on their own.

alter table picks_log add column if not exists source     text;
alter table picks_log add column if not exists rs_score   numeric;
alter table picks_log add column if not exists ret_6mo_at_pick numeric;

create index if not exists picks_log_source on picks_log (source);

-- Everything loaded before this migration came from the shortlist/entry zone.
update picks_log set source = 'shortlist' where source is null;
