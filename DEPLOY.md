# 바이버스 배포 가이드 (Vercel)

GitHub에 코드를 올리고 → Vercel에 연결하면, **앞으로 코드가 바뀔 때마다 자동으로 다시 배포**됩니다.
한 번만 설정해두면 그 다음부터는 신경 쓸 게 없어요.

> 준비물: GitHub 계정, Vercel 계정 (둘 다 무료 · Vercel은 "GitHub으로 로그인" 가능해서 사실상 계정 하나)
> ⏱️ 처음 한 번 약 15분

각 단계마다 **"❗막히면"** 칸을 봐주세요. 거기에 해결법이 있어요.

---

## STEP 1. GitHub에 비공개 저장소 만들기
1. https://github.com/new 접속
2. **Repository name**: `vibers`
3. **Private** 선택 ✅ (소스코드 비공개)
4. 나머지(README/gitignore/license)는 **체크하지 말고** 비워두기 — 우리가 이미 만들어뒀어요
5. **Create repository** 클릭
6. 다음 화면에 나오는 주소(`https://github.com/내아이디/vibers.git`)를 복사해두세요

❗막히면: GitHub 계정이 없으면 먼저 github.com에서 가입(무료).

---

## STEP 2. 코드 올리기 (push)
> 제가 이미 `git` 초기화 + 첫 커밋까지 해뒀어요. 아래 두 줄만 실행하면 됩니다.
> (`내아이디` 자리에 본인 GitHub 아이디를 넣으세요)

터미널(또는 저에게 부탁)에서 `vibers` 폴더 안에서 실행:
```bash
git remote add origin https://github.com/내아이디/vibers.git
git push -u origin main
```
- push할 때 GitHub 로그인 창(브라우저)이 뜨면 로그인/승인하면 됩니다.

❗막히면:
- **"remote origin already exists"** → `git remote remove origin` 한 뒤 위 명령 다시.
- **로그인 창이 안 뜨거나 인증 실패** → 그냥 저에게 "push 해줘"라고 하시고 GitHub 주소를 주세요. 제가 처리할게요.
- **`.env.local`이 올라갈까 걱정** → 안 올라갑니다. `.gitignore`에 등록돼 있어요(확인 완료).

---

## STEP 3. Vercel에 연결하기
1. https://vercel.com 접속 → **"Continue with GitHub"** 로 로그인
2. **Add New… → Project** 클릭
3. 방금 만든 **`vibers`** 저장소 옆 **Import** 클릭
4. 설정 화면이 나오는데 **Framework Preset이 `Vite`로 자동 인식**될 거예요 (그대로 두기)
   - Build Command, Output Directory 등은 **건드리지 마세요** (기본값이 맞아요)

❗막히면:
- 저장소 목록에 `vibers`가 안 보이면 → "Adjust GitHub App Permissions"로 `vibers` 접근 허용.

---

## STEP 4. ⭐환경변수 입력 (제일 중요 — 빼먹으면 안 됨)
Import 화면 아래 **Environment Variables** 칸에 **2개**를 추가하세요:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://baxgxvdfifhdyorntgkh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_vWeRgyY4R2QECHXc4keZ7w__5LNb-ZE` |

> 이 두 값은 우리 `.env.local`에 있는 것과 똑같아요. (`.env.local`은 깃에 안 올라가니 여기서 따로 넣어줘야 함)
> **이걸 빼먹으면** 배포된 사이트가 mock(가짜)으로 돌아가서 누구나 조작 가능해집니다. 꼭 넣으세요.

❗막히면: 입력칸을 못 찾으면 일단 배포부터 하고, 나중에 `Settings → Environment Variables`에서 추가한 뒤 `Deployments → Redeploy` 해도 됩니다.

---

## STEP 5. 배포!
1. **Deploy** 버튼 클릭 → 1~2분 기다리면 빌드 완료
2. 🎉 `https://vibers-xxxx.vercel.app` 같은 **진짜 주소**가 생깁니다
3. 그 주소로 접속해서 화면이 뜨는지 확인

❗막히면:
- **화면 위에 노란 "미리보기 모드" 배너가 보이면** → STEP 4 환경변수를 빠뜨린 것. 추가 후 Redeploy.
- **빌드 실패(Build Failed)** → 에러 로그를 복사해서 저에게 주세요. (로컬 `npm run build`는 통과 상태라 대부분 환경변수/설정 문제예요)

---

## STEP 6. 배포 후 마무리 (Supabase 쪽 설정)
배포 주소가 생겼으니 Supabase에 그 주소를 알려줘야 로그인/이메일이 정상 동작해요.
1. Supabase → `Authentication → URL Configuration`
2. **Site URL** 에 배포 주소(`https://vibers-xxxx.vercel.app`) 입력
3. **Redirect URLs** 에도 같은 주소 추가 → Save
4. 그리고 [SECURITY.md](SECURITY.md)의 "배포 전 체크리스트"(이메일 인증 ON 등)를 진행하세요

---

## 앞으로 코드 수정 후 재배포 (자동)
한 번 연결해두면, 코드를 고치고 아래만 하면 **Vercel이 알아서 다시 배포**합니다:
```bash
git add -A
git commit -m "수정 내용"
git push
```
(또는 저에게 "변경사항 푸시해줘"라고 하셔도 돼요)

---

## 🆘 자주 나는 문제 빠른 표

| 증상 | 원인 | 해결 |
|---|---|---|
| 노란 "미리보기 모드" 배너 | 환경변수 누락 | STEP 4 → Redeploy |
| 로그인은 되는데 새로고침하면 풀림 | Site URL 미설정 | STEP 6 |
| 가입 시 확인 메일이 안 옴 | 무료 메일 한도(2통/시간) | 잠시 후 재시도, 실서비스는 SMTP 연결 |
| "작품을 불러오지 못했습니다" | 테이블 미생성 | `schema.sql` + `schema_marketplace.sql` 실행 확인 |
| 빌드 실패 | 보통 설정 문제 | 로그 복사해서 문의 |

문제가 생기면 **에러 메시지(또는 스크린샷)를 그대로** 저에게 주세요. 어느 단계에서 막혔는지 함께 짚어 고치면 됩니다.
