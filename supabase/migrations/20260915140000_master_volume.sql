-- `masterGain` became `masterVolume` in the product and in `UserPreferences`,
-- so the column follows the same name. Domain, Dexie, and this schema are
-- required to describe the same product.
alter table public.user_preferences
  rename column master_gain to master_volume;
