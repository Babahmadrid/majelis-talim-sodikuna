-- MAJELIS TA'LIM SODIKUNA - skema awal Supabase
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '',
 role text not null default 'jamaah' check (role in ('super_admin','ketua','sekretaris','bendahara','koordinator','petugas_absensi','jamaah')),
 jamaah_id uuid,
 created_at timestamptz not null default now()
);
create table if not exists public.jamaah (
 id uuid primary key default gen_random_uuid(),
 member_no text unique not null,
 name text not null,
 phone text,
 address text,
 status text not null default 'aktif' check(status in ('aktif','nonaktif')),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_jamaah_fk foreign key (jamaah_id) references public.jamaah(id) on delete set null;
create table if not exists public.agenda (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 event_date date not null,
 event_time text,
 location text,
 speaker text,
 description text,
 status text not null default 'direncanakan',
 qr_token uuid not null default gen_random_uuid(),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.attendance (
 id uuid primary key default gen_random_uuid(),
 agenda_id uuid not null references public.agenda(id) on delete cascade,
 jamaah_id uuid not null references public.jamaah(id) on delete cascade,
 status text not null check(status in ('hadir','izin','sakit','alpa')),
 note text,
 recorded_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(agenda_id,jamaah_id)
);
create table if not exists public.finance (
 id uuid primary key default gen_random_uuid(),
 transaction_date date not null,
 type text not null check(type in ('masuk','keluar')),
 amount numeric(14,2) not null check(amount>=0),
 description text not null,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.announcements (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 body text not null,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.documentation (
 id uuid primary key default gen_random_uuid(),
 agenda_id uuid references public.agenda(id) on delete set null,
 title text not null,
 file_path text,
 notes text,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.activity_logs (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id),
 action text not null,
 table_name text,
 record_id uuid,
 details jsonb,
 created_at timestamptz not null default now()
);

create or replace function public.current_role()
returns text language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_role() in ('super_admin','ketua','sekretaris','bendahara','koordinator','petugas_absensi'),false) $$;

alter table public.profiles enable row level security;
alter table public.jamaah enable row level security;
alter table public.agenda enable row level security;
alter table public.attendance enable row level security;
alter table public.finance enable row level security;
alter table public.announcements enable row level security;
alter table public.documentation enable row level security;
alter table public.activity_logs enable row level security;

create policy "profile read self or admin" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy "profile admin update" on public.profiles for update to authenticated using(public.current_role()='super_admin') with check(public.current_role()='super_admin');
create policy "jamaah read authenticated" on public.jamaah for select to authenticated using(public.is_admin() or id=(select jamaah_id from public.profiles where id=auth.uid()));
create policy "jamaah admin manage" on public.jamaah for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "agenda read authenticated" on public.agenda for select to authenticated using(true);
create policy "agenda admin manage" on public.agenda for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "attendance read own or admin" on public.attendance for select to authenticated using(public.is_admin() or jamaah_id=(select jamaah_id from public.profiles where id=auth.uid()));
create policy "attendance admin manage" on public.attendance for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "finance admin only" on public.finance for all to authenticated using(public.current_role() in ('super_admin','bendahara','ketua')) with check(public.current_role() in ('super_admin','bendahara','ketua'));
create policy "announcements read authenticated" on public.announcements for select to authenticated using(true);
create policy "announcements admin manage" on public.announcements for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "documentation read authenticated" on public.documentation for select to authenticated using(true);
create policy "documentation admin manage" on public.documentation for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "logs admin read" on public.activity_logs for select to authenticated using(public.is_admin());
create policy "logs authenticated insert" on public.activity_logs for insert to authenticated with check(actor_id=auth.uid());

-- Profil admin pertama dibuat melalui Dashboard Supabase setelah akun Auth dibuat:
-- insert into public.profiles(id,full_name,role) values ('UUID_AUTH_USER','Nama Admin','super_admin');
-- Buat akun jamaah/pengurus melalui Supabase Auth, lalu pasangkan profile + jamaah_id.
