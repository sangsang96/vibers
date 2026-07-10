-- ============================================================
--  바이브스테이지 — 데모/깃허브 클릭 측정 (쿼리 04)
--  01(schema.sql), 02(schema_marketplace.sql) 실행 후 돌리세요.
--  여러 번 실행해도 안전합니다.
--
--  · projects 에 누적 카운트 컬럼 추가 (demo_clicks / github_clicks)
--  · clicks 테이블: 누가 언제 눌렀는지 원본 기록 (분석용)
--  · 트리거가 클릭 기록 시 누적 카운트를 자동 +1
-- ============================================================

alter table public.projects add column if not exists demo_clicks   int not null default 0;
alter table public.projects add column if not exists github_clicks int not null default 0;

create table if not exists public.clicks (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.projects(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null, -- 비로그인 클릭은 null
  kind        text not null check (kind in ('demo', 'github')),
  created_at  timestamptz not null default now()
);

alter table public.clicks enable row level security;

-- 클릭 기록은 누구나 남길 수 있음 (비로그인 방문자의 데모 체험도 집계)
drop policy if exists "clicks_insert_any" on public.clicks;
create policy "clicks_insert_any" on public.clicks
  for insert to anon, authenticated with check (true);

-- 조회는 공개 (작품 카드에 횟수 표시용)
drop policy if exists "clicks_select_all" on public.clicks;
create policy "clicks_select_all" on public.clicks
  for select using (true);

-- 클릭이 기록되면 작품의 누적 카운트 자동 증가
create or replace function public.bump_clicks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'demo' then
    update public.projects set demo_clicks = demo_clicks + 1 where id = new.project_id;
  elsif new.kind = 'github' then
    update public.projects set github_clicks = github_clicks + 1 where id = new.project_id;
  end if;
  return new;
end; $$;
drop trigger if exists clicks_count on public.clicks;
create trigger clicks_count after insert on public.clicks
  for each row execute function public.bump_clicks();

-- (선택) 시드 작품에 예시 GitHub 링크 채우기 — 데모 화면용
update public.projects set github = 'https://github.com/supabase/supabase'
  where builder = 'indiebuilder' and (github is null or github = '');
update public.projects set github = 'https://github.com/n8n-io/n8n'
  where builder = 'automate_kr' and (github is null or github = '');
