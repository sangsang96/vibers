-- ============================================================
--  바이버스 — 관리자 통계용 추가 정책 (쿼리 03)
--  schema.sql(01), schema_marketplace.sql(02) 실행 후에 돌리세요.
--
--  라이선스(매출) 통계를 관리자가 전체 조회할 수 있게 하는 정책.
--  (기존엔 "본인 라이선스만" 볼 수 있어서 관리자가 총매출을 못 봤음)
-- ============================================================

drop policy if exists "licenses_select_admin" on public.licenses;
create policy "licenses_select_admin" on public.licenses
  for select to authenticated
  using (public.is_admin());

-- 참고: profiles / projects / comments / likes 는 이미 "누구나 select" 정책이 있어
--        관리자 통계(개수 집계)에 문제가 없습니다.
