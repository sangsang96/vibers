# 자동 배포 설정 (GitHub → Vercel)

한 번만 연결해두면, 코드가 바뀔 때마다 **자동으로 인터넷에 반영**됩니다.
Netlify에 매번 폴더를 드래그하던 방식과 작별하는 거예요.

```
지금:  코드 수정 → 빌드 → dist 폴더를 손으로 드래그  (매번 반복)
이후:  코드 수정 → git push  →  Vercel이 자동으로 빌드+배포  (드래그 없음)
```

---

## 1회 설정 (약 15분)

### STEP 1. GitHub에 코드 올리기
이미 `git` 커밋은 다 돼 있어요. 저장소에 연결(push)만 하면 됩니다.
> ⚠️ push는 GitHub 로그인이 필요해서 **상현님 컴퓨터에서** 해야 해요.

**방법 A — GitHub Desktop (클릭, 추천)**
1. https://desktop.github.com 설치 → GitHub 로그인
2. **File → Add Local Repository** → `바이브코딩\vibers` 폴더 선택
3. 상단 **Publish repository** (또는 Push origin) 클릭 → 완료
   - 이미 원격 주소(`github.com/sangsang96/vibers`)가 연결돼 있어요.

**방법 B — 터미널**
`vibers` 폴더에서 Shift+우클릭 → 터미널 열기 → `git push -u origin main` → 브라우저 로그인

### STEP 2. Vercel 연결
1. https://vercel.com → **Continue with GitHub** 로그인
2. **Add New → Project** → `vibers` 저장소 **Import**
3. Framework: **Vite** 자동 인식 (그대로 두기)

### STEP 3. ⭐ 환경변수 2개 입력 (필수)
Import 화면의 **Environment Variables** 에:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://baxgxvdfifhdyorntgkh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_vWeRgyY4R2QECHXc4keZ7w__5LNb-ZE` |

→ **Deploy** 클릭. 1~2분 뒤 `https://vibers-xxxx.vercel.app` 주소 생성 🎉

### STEP 4. 배포 주소를 Supabase에 등록
Supabase → **Authentication → URL Configuration** → **Site URL** 과 **Redirect URLs** 에 배포 주소 추가 → Save
(로그인이 새로고침 때 풀리지 않게 하려면 필요)

---

## 이후 — "자동 배포"는 이렇게 돌아가요

코드를 고친 뒤 **push 한 번**이면 Vercel이 알아서 빌드+배포합니다:

**GitHub Desktop 쓰는 경우**
1. 앱을 열면 바뀐 파일이 왼쪽에 보여요
2. 아래 요약(Summary)에 뭘 바꿨는지 한 줄 적고 **Commit to main**
3. 상단 **Push origin** 클릭 → 끝. 1~2분 뒤 사이트에 반영

**터미널 쓰는 경우**
```bash
git add -A
git commit -m "무엇을 바꿨는지"
git push
```

> 💡 저(클로드)에게 "커밋하고 푸시해줘"라고 하면 커밋까지는 만들어드려요.
> 다만 **push의 GitHub 인증은 상현님 컴퓨터에서** 해야 해서, 마지막 push 버튼/명령만 직접 눌러주시면 됩니다.

---

## 자주 나는 문제

| 증상 | 해결 |
|---|---|
| 노란 "미리보기 모드" 배너 | STEP 3 환경변수 누락 → Vercel Settings에서 추가 후 Redeploy |
| push가 안 됨 (인증 실패) | GitHub Desktop 쓰기 / 브라우저 로그인 팝업 승인 |
| 빌드 실패 | Vercel의 빌드 로그 복사해서 문의 (로컬 `npm run build`는 통과 상태) |
| 새 기능(클릭 측정 등)이 안 보임 | DB에 `schema_clicks.sql`(쿼리04) 실행했는지 확인 |

---

## 참고: 지금 남아있는 배포 방식
- **Netlify(수동 드래그)**: 이미 해봤던 방식. `dist` 폴더를 Deploys 화면에 드래그. 빠르지만 매번 수동.
- **Vercel(자동)**: 위 설정. push하면 자동. **장기적으로 이게 편해요.**

둘 다 유지해도 되고, Vercel로 정착하면 Netlify 사이트는 지워도 됩니다.
