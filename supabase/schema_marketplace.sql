-- ============================================================
--  바이버스 — 마켓 기능용 스키마 (작품/댓글/좋아요/라이선스)
--  회원가입용 schema.sql 을 먼저 실행한 뒤, 이 파일을 SQL Editor 에 붙여넣고 RUN 하세요.
--  여러 번 실행해도 안전합니다.
-- ============================================================

-- 관리자 판별 헬퍼 (RLS 에서 재사용)
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 1) 작품 ─────────────────────────────────────────────────
create table if not exists public.projects (
  id          bigint generated always as identity primary key,
  title       text not null,
  cat         text not null,
  story       text not null,
  demo        text,
  github      text,
  sns         text[] not null default '{}',
  stacks      text[] not null default '{}',
  builder     text not null,                                   -- 표시용 닉네임
  builder_id  uuid references public.profiles(id) on delete set null,
  hue         int  not null default 200,
  commercial  jsonb not null default '{"enabled":false}'::jsonb,
  likes       int  not null default 0,
  comments    int  not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.projects enable row level security;
drop policy if exists "projects_select_all" on public.projects;
create policy "projects_select_all" on public.projects for select using (true);
drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects for insert to authenticated with check (auth.uid() = builder_id);
drop policy if exists "projects_delete_own_or_admin" on public.projects;
create policy "projects_delete_own_or_admin" on public.projects for delete to authenticated using (auth.uid() = builder_id or public.is_admin());

-- 2) 댓글 ─────────────────────────────────────────────────
create table if not exists public.comments (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.projects(id) on delete cascade,
  user_id     uuid   not null references public.profiles(id) on delete cascade,
  username    text   not null,
  text        text   not null,
  created_at  timestamptz not null default now()
);
alter table public.comments enable row level security;
drop policy if exists "comments_select_all" on public.comments;
create policy "comments_select_all" on public.comments for select using (true);
drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "comments_delete_own_or_admin" on public.comments;
create policy "comments_delete_own_or_admin" on public.comments for delete to authenticated using (auth.uid() = user_id or public.is_admin());

-- 3) 좋아요 (한 사람당 작품별 1개) ───────────────────────────
create table if not exists public.likes (
  project_id  bigint not null references public.projects(id) on delete cascade,
  user_id     uuid   not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table public.likes enable row level security;
drop policy if exists "likes_select_all" on public.likes;
create policy "likes_select_all" on public.likes for select using (true);
drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own" on public.likes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own" on public.likes for delete to authenticated using (auth.uid() = user_id);

-- 4) 라이선스 (구매 증빙 — 본인 것만 조회) ────────────────────
create table if not exists public.licenses (
  id          bigint generated always as identity primary key,
  project_id  bigint references public.projects(id) on delete set null,
  user_id     uuid   not null references public.profiles(id) on delete cascade,
  title       text   not null,
  builder     text   not null,
  kind        text   not null check (kind in ('once','sub')),
  price       int    not null,
  created_at  timestamptz not null default now()
);
alter table public.licenses enable row level security;
drop policy if exists "licenses_select_own" on public.licenses;
create policy "licenses_select_own" on public.licenses for select to authenticated using (auth.uid() = user_id);
drop policy if exists "licenses_insert_own" on public.licenses;
create policy "licenses_insert_own" on public.licenses for insert to authenticated with check (auth.uid() = user_id);

-- 5) 좋아요/댓글 수 자동 집계 트리거 ─────────────────────────
create or replace function public.bump_likes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.projects set likes = likes + 1 where id = new.project_id; return new;
  elsif tg_op = 'DELETE' then update public.projects set likes = greatest(0, likes - 1) where id = old.project_id; return old;
  end if; return null;
end; $$;
drop trigger if exists likes_count on public.likes;
create trigger likes_count after insert or delete on public.likes
  for each row execute function public.bump_likes();

create or replace function public.bump_comments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.projects set comments = comments + 1 where id = new.project_id; return new;
  elsif tg_op = 'DELETE' then update public.projects set comments = greatest(0, comments - 1) where id = old.project_id; return old;
  end if; return null;
end; $$;
drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete on public.comments
  for each row execute function public.bump_comments();

-- 6) 시드 작품 4개 (피드가 비어 보이지 않게) ──────────────────
--    builder_id 는 비워둠(데모용). 본인이 올린 작품은 builder_id 가 채워집니다.
insert into public.projects (title, cat, story, demo, builder, hue, stacks, commercial, likes, comments)
select * from (values
  ('구독 해지 방어 대시보드','웹앱','주말에 우리 서비스 이탈률 보다가 빡쳐서 만든 리텐션 대시보드. 이탈 점수 자동 계산.','https://example.com/d1','indiebuilder',18, array['React','Supabase'], '{"enabled":true,"price":180000,"sub":19000}'::jsonb,142,18),
  ('인스타 릴스 자동 생성 봇','자동화/봇','키워드 넣으면 대본·자막·썸네일 만들어 예약 업로드. n8n 워크플로우 한 방.','https://example.com/d2','automate_kr',268, array['n8n','Python'], '{"enabled":true,"price":95000,"sub":9900}'::jsonb,301,44),
  ('동네 모임 매칭 앱','모바일','혼자 살다 외로워서 만든 위치기반 소모임 매칭 앱. 그냥 구경용으로 공개해요.','https://example.com/d3','moim_dev',150, array['Flutter','Supabase'], '{"enabled":false}'::jsonb,88,7),
  ('노션 회의록 자동 요약기','AI도구','회의 녹음 던지면 노션에 액션아이템까지 정리. 매주 2시간 아낌.','https://example.com/d4','pm_sang',38, array['Next.js','TypeScript'], '{"enabled":true,"price":120000,"sub":12000}'::jsonb,256,31)
) as v(title,cat,story,demo,builder,hue,stacks,commercial,likes,comments)
where not exists (select 1 from public.projects);  -- 이미 작품이 있으면 시드 건너뜀
