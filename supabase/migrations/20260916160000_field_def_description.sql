-- A custom field is named by its heading, and the second thing its editor asks
-- for is what the field is *for* — not an identifier the reader has to invent
-- (the owner's round 6: "the add custom field should not be label and key, it
-- should be heading and description"). `field_defs.label` is that heading, so
-- the new column is the description beside it.
--
-- `field_defs.key` stays exactly as it is: it is what a table view's
-- `column_keys` name, and what a stored value is keyed to. It is derived from
-- the heading when the field is created (`fieldKeyFor` in the application) and
-- then never changes, so renaming a heading cannot strand a view.
alter table public.field_defs
  add column if not exists description text not null default '';
