-- Audio files carry an order (`P2 · 4`, the owner's answer 2026-09-21).
--
-- The library's Audio files list is a list the reader can see, so a screen has to
-- be able to patch it: an upload is inserted after the last row rather than
-- nowhere, and a delete leaves the rest of the order alone. `binaural_presets`
-- already carries `sort_order`; this is the same column for the same reason.
--
-- Additive and re-runnable, like every migration here, and no backfill is owed:
-- media never leaves the device today, so the cloud holds no row to order — the
-- rows that exist are on devices, and Dexie v26 numbers those.

alter table public.media_assets
  add column if not exists sort_order int not null default 0;
