-- ============================================================
--  바이브스테이지 — 보관함(북마크) + 카테고리 관리 (쿼리 05)
--  01~04 실행 후에 돌리세요. 여러 번 실행해도 안전합니다.
-- ============================================================

-- 1) 보관함(북마크) — 내가 저장한 작품 (비공개, 본인만)
create table if not exists public.bookmarks (
  user_id     uuid   not null references public.profiles(id) on delete cascade,
  project_id  bigint not null references public.projects(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.bookmarks enable row level security;
drop policy if exists "bookmarks_select_own" on public.bookmarks;
create policy "bookmarks_select_own" on public.bookmarks
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "bookmarks_insert_own" on public.bookmarks;
create policy "bookmarks_insert_own" on public.bookmarks
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "bookmarks_delete_own" on public.bookmarks;
create policy "bookmarks_delete_own" on public.bookmarks
  for delete to authenticated using (auth.uid() = user_id);

-- 2) 카테고리 — 관리자만 추가/삭제, 누구나 조회
create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
drop policy if exists "categories_select_all" on public.categories;
create policy "categories_select_all" on public.categories for select using (true);
drop policy if exists "categories_admin_insert" on public.categories;
create policy "categories_admin_insert" on public.categories for insert to authenticated with check (public.is_admin());
drop policy if exists "categories_admin_delete" on public.categories;
create policy "categories_admin_delete" on public.categories for delete to authenticated using (public.is_admin());
drop policy if exists "categories_admin_update" on public.categories;
create policy "categories_admin_update" on public.categories for update to authenticated using (public.is_admin());

-- 기본 카테고리 시드 (이미 있으면 건너뜀)
insert into public.categories (name, sort)
select * from (values
  ('웹앱', 1), ('모바일', 2), ('자동화/봇', 3),
  ('크롬확장', 4), ('AI도구', 5), ('기타', 6)
) as v(name, sort)
on conflict (name) do nothing;
