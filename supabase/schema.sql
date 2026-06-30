-- ============================================================
--  바이버스(Vibers) — 회원가입/인증용 DB 스키마
--  Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 RUN 하세요.
--  (여러 번 실행해도 안전하도록 작성되어 있습니다.)
--
--  구성:
--   1) profiles 테이블 (username, role)
--   2) 회원가입 시 profiles 자동 생성 트리거
--   3) RLS 정책 — 본인 프로필만 수정, role 은 스스로 못 바꿈
-- ============================================================

-- 1) ─────────────────────────────────────────────────────────
--  profiles: auth.users 와 1:1로 연결되는 공개 프로필
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is '사용자 공개 프로필. role 로 관리자 여부를 판별.';

-- 2) ─────────────────────────────────────────────────────────
--  회원가입(auth.users insert) 시 profiles 행을 자동 생성하는 트리거.
--  signUp 의 options.data.username 값(raw_user_meta_data->>'username')을 사용.
--  닉네임이 비어 있으면 이메일 앞부분을 기본값으로 사용.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer            -- RLS 를 우회하여 안전하게 insert
set search_path = public
as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1)),
    'user'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) ─────────────────────────────────────────────────────────
--  RLS(Row Level Security): 행 단위 접근 제어
alter table public.profiles enable row level security;

-- (a) 프로필은 누구나 읽을 수 있음 (피드에 @닉네임을 표시해야 하므로)
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

-- (b) 본인 행만 수정 가능
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- (c) ⚠️ 권한 상승 방지: 사용자는 username 만 바꿀 수 있고 role 은 못 바꾼다.
--     RLS 만으로는 특정 컬럼을 막을 수 없으므로 컬럼 단위 권한으로 처리.
revoke update on public.profiles from anon, authenticated;
grant  update (username) on public.profiles to authenticated;

-- (insert 는 위 트리거(security definer)가 전담하므로 사용자 insert 권한은 주지 않음)

-- ============================================================
--  관리자 지정 방법 (가입을 먼저 끝낸 뒤 실행)
--    update public.profiles set role = 'admin' where username = '내닉네임';
--  되돌리기:
--    update public.profiles set role = 'user'  where username = '내닉네임';
-- ============================================================
