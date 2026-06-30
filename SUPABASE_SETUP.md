# 바이버스 — Supabase 인증 연동 가이드

이 문서대로 따라 하면 **회원가입/로그인이 진짜 서버(Supabase)에 연결**됩니다.
키를 넣기 전에는 자동으로 mock(미리보기) 인증으로 동작하므로, 언제든 먼저 화면부터 확인할 수 있어요.

소요 시간: 약 10분. 카드 등록 없이 무료 플랜으로 충분합니다.

---

## 0. 미리 실행해 보기 (선택)

키 없이도 바로 띄워볼 수 있습니다.

```bash
cd vibers
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 → 상단에 "미리보기 모드" 배너가 보이면 mock 인증 상태입니다.
이 상태에서도 회원가입/로그인 흐름을 전부 체험할 수 있어요(데이터는 새로고침하면 사라짐).
닉네임을 `admin` 으로 가입하면 관리자 콘솔도 미리 볼 수 있습니다.

---

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에서 가입/로그인
2. **New project** 클릭
3. 항목 입력
   - **Name**: `vibers` (자유)
   - **Database Password**: 강한 비밀번호 (어딘가 저장해 두세요)
   - **Region**: `Northeast Asia (Seoul)` 권장
4. **Create new project** → 1~2분 기다리면 생성 완료

---

## 2. API 키를 `.env.local` 에 넣기

1. 프로젝트 대시보드 → 좌측 톱니바퀴 **Project Settings** → **API**
2. 두 값을 복사:
   - **Project URL**
   - **Project API keys → `anon` `public`**  (← 이게 클라이언트용 공개 키)
3. 프로젝트 폴더에서 `.env.example` 을 복사해 `.env.local` 을 만들고 채웁니다:

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...(긴 문자열)
```

> ⚠️ `service_role` 키는 절대 프론트엔드/`.env.local` 에 넣지 마세요. 브라우저에 노출되면 DB 전체가 뚫립니다.
> `.env.local` 은 `.gitignore` 에 이미 등록돼 있어 깃에 올라가지 않습니다.

---

## 3. 데이터베이스 스키마 만들기

회원가입을 받으려면 `profiles` 테이블과 자동 생성 트리거가 필요합니다.

1. 대시보드 → 좌측 **SQL Editor** → **New query**
2. 이 저장소의 [`supabase/schema.sql`](supabase/schema.sql) 내용을 **통째로 복사**해 붙여넣기
3. **Run** 클릭 → "Success" 가 뜨면 완료

이 SQL이 만드는 것:
- `profiles` 테이블 (`username`, `role`)
- 회원가입 시 `profiles` 행을 자동으로 만드는 트리거
- RLS 정책: 본인 프로필만 수정 가능, **`role` 은 사용자가 스스로 못 바꿈**(권한 상승 차단)

---

## 4. 이메일 인증 옵션 정하기

대시보드 → **Authentication** → **Sign In / Providers** (또는 **Providers → Email**)

- **Confirm email = ON (기본값)**: 가입 시 확인 메일이 발송되고, 링크를 눌러야 로그인됩니다.
  앱은 이 경우 "가입 확인 메일을 보냈습니다" 안내를 보여줍니다. (실서비스 권장)
- **빠른 테스트**: 이 옵션을 잠시 **OFF** 로 두면 가입 즉시 로그인됩니다. 개발이 끝나면 다시 켜세요.

> 무료 플랜의 기본 메일은 발송량 제한이 있습니다. 실서비스에서는
> **Authentication → Emails → SMTP** 에 본인 메일 서비스(Resend, SendGrid 등)를 연결하세요.

배포 후에는 **Authentication → URL Configuration** 의 **Site URL / Redirect URLs** 에
실제 도메인을 등록해야 확인 메일 링크가 올바르게 동작합니다. (로컬은 `http://localhost:5173`)

---

## 5. 실행 & 확인

```bash
npm run dev
```

- 상단 "미리보기 모드" 배너가 **사라졌다면** → 진짜 Supabase 에 연결된 것입니다. ✅
- 회원가입 → 대시보드 **Authentication → Users** 에 새 유저가 보입니다.
- 대시보드 **Table Editor → profiles** 에 닉네임 행이 자동 생성됐는지 확인하세요.

---

## 6. 나를 관리자로 만들기

1. 위 4·5 단계로 **먼저 회원가입**을 끝냅니다.
2. SQL Editor 에서 실행 (닉네임을 본인 것으로):

```sql
update public.profiles set role = 'admin' where username = '내닉네임';
```

3. 앱에서 로그아웃 후 다시 로그인 → 헤더에 **관리자** 뱃지가 뜨고, 하단 "관리자" 링크로 콘솔에 들어갈 수 있습니다.

---

## 자주 묻는 것 / 문제 해결

- **"미리보기 모드" 배너가 안 사라져요**
  → `.env.local` 의 키 오타, 또는 `npm run dev` 를 **재시작**하지 않았을 가능성. Vite 는 env 변경 시 재시작이 필요합니다.

- **가입은 됐는데 `profiles` 에 행이 없어요**
  → 3단계 SQL(특히 트리거)을 안 돌렸을 때 발생합니다. `schema.sql` 을 다시 Run 하세요.

- **"이미 사용 중인 닉네임입니다" 가 떠요**
  → `username` 은 unique 라 중복되면 가입이 실패합니다. 다른 닉네임으로 시도하세요.

- **로그인은 되는데 관리자 콘솔이 권한 없음으로 떠요**
  → 정상입니다. 6단계로 `role='admin'` 을 지정해야 관리자 기능이 열립니다.

---

## 지금 무엇이 "진짜"이고 무엇이 "임시"인가

이번 작업의 범위는 **회원가입/로그인/권한(인증)** 입니다.

| 기능 | 상태 |
|---|---|
| 회원가입·로그인·로그아웃 | ✅ Supabase Auth (실제) |
| 비밀번호 해싱·세션 | ✅ Supabase 서버가 처리 |
| 프로필(닉네임)·관리자 권한(role) | ✅ `profiles` 테이블 (실제) |
| 작품 피드 / 좋아요 / 댓글 / 라이선스 / 결제 | 🧪 아직 브라우저 메모리에만 저장(시드 데이터) |

작품·댓글·라이선스까지 DB에 영구 저장하고 싶으면, 다음 단계로
`projects` / `comments` / `licenses` 테이블 + RLS 를 추가하면 됩니다. 필요할 때 말씀 주세요.
