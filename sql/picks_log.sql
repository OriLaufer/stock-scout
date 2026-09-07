-- THE FEEDBACK LOOP
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
--
-- Why this table exists: 71 of the ~116 points in the conviction score have
-- never been measured against a real forward return. The entry gates were —
-- that measurement is the only reason we stopped buying at +100% and it is
-- what saved us. Everything else (business, structure, theme, size) is a
-- well-argued guess.
--
-- One row per pick per week, with EVERY score component in its own column, so
-- that in three months we can ask the one question we cannot ask today:
-- "did a high business score actually earn more than a low one?" — and then
-- raise the weights that earn their place and delete the ones that do not.

create table if not exists picks_log (
  id                  text primary key,          -- "<ticker>-<week_label>"
  ticker              text not null,
  week_label          text not null,
  pick_date           date not null,
  rank_in_week        int,

  -- what it was when we picked it
  price               numeric not null,
  market_cap          bigint,
  sector              text,
  industry            text,
  name                text,

  -- the verdict
  conviction          numeric,

  -- every component, separately, so each can be correlated on its own
  s_entry             numeric,
  s_leadership        numeric,
  s_theme             numeric,
  s_structure         numeric,
  s_climb             numeric,
  s_confirmation      numeric,
  s_business          numeric,
  s_analyst           numeric,
  s_room              numeric,

  -- raw facts worth testing independently of how we scored them
  pct_above_50dma     numeric,
  pct_above_200dma    numeric,
  rs_vs_spy_6mo       numeric,
  rev_yoy_pct         numeric,
  rev_qoq_pct         numeric,
  gross_margin_pct    numeric,
  operating_margin_pct numeric,
  runway_quarters     numeric,
  self_funding        boolean,
  analyst_count       int,
  target_upside_pct   numeric,
  short_pct           numeric,
  legs                int,
  higher_lows         boolean,
  structure_position  text,
  theme_industry      text,
  theme_trajectory    text,
  theme_members       int,

  -- the levels we published, so we can test whether the stops helped or hurt
  stop_price          numeric,
  thesis_stop_price   numeric,
  target_1            numeric,
  target_2            numeric,

  -- filled in later by measure.py
  px_4w               numeric,
  px_12w              numeric,
  px_26w              numeric,
  ret_4w              numeric,
  ret_12w             numeric,
  ret_26w             numeric,
  max_gain_12w        numeric,
  max_drawdown_12w    numeric,
  stop_hit_12w        boolean,
  thesis_stop_hit_12w boolean,
  measured_at         timestamptz,

  created_at          timestamptz default now()
);

create index if not exists picks_log_week  on picks_log (week_label);
create index if not exists picks_log_ticker on picks_log (ticker);
create index if not exists picks_log_unmeasured on picks_log (pick_date)
  where measured_at is null;

alter table picks_log enable row level security;

drop policy if exists "allow_all_picks_log" on picks_log;
create policy "allow_all_picks_log" on picks_log
  for all to anon, authenticated using (true) with check (true);
