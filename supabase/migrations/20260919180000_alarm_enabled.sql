-- The alarm gets a switch (the owner's round 15, P7).
--
-- The owner's §12.4: "an alarm switch everywhere there is a binaural switch". The
-- answer refined the *scope* rather than the placement — §12.21: "the alarm is
-- session-level like Auto-advance; binaural and auto-scroll are per stage" — so the
-- switch lives on the plan, beside `binaural_enabled` and `auto_advance`, and the
-- reader's preference carries the value a **new** plan is created with, exactly as
-- `auto_advance` already does in both tables.
--
-- Additive and re-runnable, like its siblings: `default true` is the behaviour every
-- existing plan already has, so a row written before this column keeps ringing its
-- alarm. Nothing is backfilled because nothing has to be — the default is the old
-- behaviour, and `packages/db/src/plan-mapper.ts` reads a stored plan that has no
-- `alarmEnabled` the same way (absent means on).

alter table public.plans
  add column if not exists alarm_enabled boolean not null default true;

alter table public.user_preferences
  add column if not exists alarm_enabled boolean not null default true;
