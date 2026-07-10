# 관리자 기능 켜기 (통계 · 사용자 삭제)

관리자 콘솔은 하단 **"관리자"** 링크로 들어가요. 아래 3가지를 하면 **통계·작품삭제·댓글삭제·사용자삭제**가 전부 작동합니다.

| 기능 | 필요한 것 |
|---|---|
| 통계(가입/작품/댓글/좋아요) · 작품/댓글 삭제 | STEP 1만 하면 됨 |
| 누적 매출 통계 | + STEP 2 |
| 사용자 완전 삭제 | + STEP 3 |

---

## STEP 1. 나를 관리자로 지정 (필수)
Supabase → **SQL Editor** → New query → 실행 (`내닉네임`을 본인 것으로):
```sql
update public.profiles set role = 'admin' where username = '내닉네임';
```
→ 앱에서 로그아웃 후 다시 로그인하면 헤더에 **관리자** 뱃지가 뜨고, 하단 "관리자"로 콘솔에 들어갈 수 있어요.

이것만 해도 **통계 대부분 + 작품/댓글 삭제**가 됩니다.

---

## STEP 2. 매출 통계 켜기 (선택)
"누적 매출"까지 보려면 관리자용 조회 정책을 추가하세요.
SQL Editor에 [supabase/schema_admin.sql](supabase/schema_admin.sql) 내용을 붙여넣고 실행:
```sql
drop policy if exists "licenses_select_admin" on public.licenses;
create policy "licenses_select_admin" on public.licenses
  for select to authenticated using (public.is_admin());
```

---

## STEP 3. 사용자 삭제 기능 켜기 (Edge Function 배포)

사용자를 "진짜로" 지우려면 계정(auth) 삭제 권한이 필요한데, 이건 브라우저에서 하면 위험해요.
그래서 **서버 함수**가 "요청자가 관리자인지" 확인한 뒤에만 삭제하도록 만들어뒀어요. 배포만 하면 됩니다.

함수 코드: [supabase/functions/delete-user/index.ts](supabase/functions/delete-user/index.ts)

### 방법 A — 대시보드에서 (클릭, 추천)
1. Supabase → 좌측 **Edge Functions** → **Create a function** (또는 Deploy new function)
2. 이름: **`delete-user`**
3. 편집기에 위 `index.ts` 내용을 **통째로 붙여넣기**
4. **Deploy** 클릭
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 **자동으로 넣어줘서** 따로 설정 안 해도 돼요.

### 방법 B — CLI로 (터미널이 익숙하면)
```bash
npm i -g supabase
supabase login
supabase link --project-ref baxgxvdfifhdyorntgkh
supabase functions deploy delete-user
```

배포가 끝나면, 관리자 콘솔의 **사용자 관리**에서 "삭제" 버튼이 실제로 동작해요.
(배포 전에는 버튼을 눌러도 "함수가 배포되지 않았습니다" 안내만 떠서 안전해요.)

---

## 안전장치 (이렇게 보호돼요)
- 삭제 함수는 **서버에서** 요청자의 `profiles.role='admin'`을 확인합니다. 관리자가 아니면 거부(403).
- **본인 계정은 삭제 불가**(실수로 자기 관리자 계정을 지우는 것 방지).
- service_role 키는 **서버 함수 안에서만** 쓰이고 브라우저/코드에 노출되지 않습니다.
- 작품·댓글·사용자 삭제는 UI 게이트 + 서버 RLS/함수로 **이중 보호**돼요.

## 사용자 삭제 시 함께 지워지는 것
- 그 사용자의 **계정 · 프로필 · 댓글 · 좋아요 · 라이선스** → 함께 삭제
- 그 사용자가 **올린 작품** → 남되 작성자 표시만 비워짐(원하면 작품 관리에서 따로 삭제)
