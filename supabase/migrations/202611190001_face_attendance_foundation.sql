-- Majelis Ta'lim Sodikuna: fondasi aman Absensi Wajah
-- Jalankan hanya setelah review. Tidak mengubah/menghapus jamaah, agenda, atau attendance.
begin;

-- Persetujuan aktif saja yang disimpan. Saat persetujuan ditarik, backend
-- menghapus baris persetujuan dan template secara permanen dari database aktif.
create table if not exists public.face_consents (
  id uuid primary key default gen_random_uuid(),
  jamaah_id uuid not null references public.jamaah(id) on delete cascade,
  consent_subject text not null check (consent_subject in ('adult_self','parent_or_guardian')),
  guardian_name text,
  consent_version text not null,
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  constraint face_consent_guardian_required check (
    (consent_subject = 'adult_self' and guardian_name is null)
    or (consent_subject = 'parent_or_guardian' and nullif(trim(guardian_name), '') is not null)
  )
);

create unique index if not exists face_consents_one_per_jamaah
  on public.face_consents(jamaah_id);

alter table public.face_consents enable row level security;
revoke all on public.face_consents from public, anon, authenticated;
grant select, insert, delete on public.face_consents to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.face_templates (
  jamaah_id uuid primary key references public.jamaah(id) on delete cascade,
  encrypted_template bytea not null,
  encryption_key_version text not null,
  model_version text not null,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.face_templates enable row level security;
revoke all on private.face_templates from public, anon, authenticated;
grant select, insert, delete on private.face_templates to service_role;

-- Atomic hard-delete entry point. SECURITY INVOKER runs with caller privileges.
create or replace function public.delete_face_data_for_jamaah(p_jamaah_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $
  delete from private.face_templates where jamaah_id = p_jamaah_id;
  delete from public.face_consents where jamaah_id = p_jamaah_id;
$;
revoke all on function public.delete_face_data_for_jamaah(uuid) from public, anon, authenticated;
grant execute on function public.delete_face_data_for_jamaah(uuid) to service_role;

comment on table public.face_consents is
  'Persetujuan aktif pemrosesan biometrik. Baris dihapus saat persetujuan ditarik.';
comment on table private.face_templates is
  'Template biometrik terenkripsi. Hanya backend tepercaya dengan secret key dan kunci enkripsi terpisah yang boleh mengakses.';
comment on column private.face_templates.encrypted_template is
  'Ciphertext embedding wajah. Jangan pernah menyimpan embedding mentah atau foto wajah di sini.';
comment on column private.face_templates.encryption_key_version is
  'Versi kunci enkripsi yang disimpan sebagai secret backend, bukan di database.';

commit;
