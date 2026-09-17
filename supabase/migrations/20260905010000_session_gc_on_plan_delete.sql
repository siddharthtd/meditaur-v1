alter table public.session_logs drop constraint session_logs_plan_id_fkey;
alter table public.session_logs
  add constraint session_logs_plan_id_fkey
  foreign key (plan_id) references public.plans(id) on delete cascade;

alter table public.session_snapshots drop constraint session_snapshots_plan_id_fkey;
alter table public.session_snapshots
  add constraint session_snapshots_plan_id_fkey
  foreign key (plan_id) references public.plans(id) on delete cascade;

create index if not exists session_logs_workspace_completed_at
  on public.session_logs (workspace_id, completed_at desc);
