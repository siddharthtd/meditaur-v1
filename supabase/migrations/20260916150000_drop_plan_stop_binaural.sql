-- `stop_binaural_on_alarm` was stored twice: on the plan and on the reader's
-- preferences. Compile read the plan's copy, so the Settings switch — the one
-- the owner kept — did nothing to an existing plan. The preference is the single
-- source now (`models.UserPreferences.stopBinauralOnAlarm`, read by
-- `compileAndStoreSession` and written into the compiled snapshot), and the plan
-- column goes with the per-plan field.
--
-- The reader's preference keeps its own column: `user_preferences` also has a
-- `stop_binaural_on_alarm`, and it is untouched here.
alter table public.plans
  drop column if exists stop_binaural_on_alarm;
