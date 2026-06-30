# 바이버스 보안 점검 결과 & 배포 전 체크리스트

> 바이브 코딩으로 만든 앱에서 가장 흔한 사고는 **① RLS(행 보안)를 안 켜서 anon 키로 DB가 통째로 털리는 것**과
> **② service_role(비밀) 키를 프론트에 노출하는 것**입니다. (2025년 CVE-2025-48757로 수백 개 앱이 이렇게 유출됨)
> 아래는 바이버스에 대해 실제로 점검한 결과입니다.

## ✅ 이미 안전하게 된 것 (점검 완료)

| 항목 | 결과 |
|---|---|
| 코드에 비밀키 하드코딩 | **없음** — service_role/secret/JWT 검색 결과 0건 |
| 프론트에 노출된 키 | `anon`(publishable) 키만 사용 — 원래 공개돼도 되는 키 |
| `.env.local`(키 파일) | `.gitignore`에 등록 → 깃/배포에 안 올라감 |
| 모든 테이블 RLS 켜짐 | profiles · projects · comments · likes · licenses 전부 ON |
| 남의 라이선스 훔쳐읽기 | 🚫 차단됨 (직접 API 테스트로 확인) |
| 인증 없이 작품 무단 등록 | 🚫 차단됨 (`row-level security policy` 에러) |
| 남의 프로필 role 조작(관리자 탈취) | 🚫 차단됨 (`permission denied`) |
| mock "admin 백도어" | **제거함** + 배포 환경에 키 없으면 콘솔 경고 |

**결론: anon 키가 공개돼도 RLS가 막아주므로 데이터는 안전합니다.**

## ⚠️ 배포 전에 상현님이 직접 해야 할 것 (대시보드 클릭)

순서대로, 하나씩 천천히 하면 됩니다. (대부분 토글 ON/OFF)

1. **[필수] Vercel 환경변수 설정** — 배포 가이드(DEPLOY.md)에 나옴.
   안 하면 배포본이 mock으로 돌아가 **누구나 가입/조작 가능**해집니다. 가장 중요.

2. **[필수] 이메일 인증 다시 켜기**
   `Authentication → Sign In/Providers → Email → Confirm email` **ON** + Save
   (지금은 테스트용으로 꺼둔 상태. 안 켜면 아무 이메일이나 도용해 가입 가능)

3. **[권장] 유출된 비밀번호 차단**
   `Authentication → Policies`(또는 Settings) → **Leaked password protection** **ON**
   (이미 유출된 흔한 비번으로 가입하는 걸 막아줌 — HaveIBeenPwned 연동)

4. **[권장] 내 Supabase 계정 2단계 인증(MFA)**
   계정 설정에서 2FA 켜기. GitHub으로 로그인했다면 GitHub에도 2FA.
   (개발자 계정이 뚫리면 DB 전체가 위험하므로)

5. **[권장] OTP 만료시간 단축**
   `Authentication → Rate Limits / Email` → OTP expiry **3600초(1시간) 이하**

6. **[선택] 봇 차단(CAPTCHA)**
   사용자가 많아지면 `Authentication → Attack Protection`에서 가입/로그인 CAPTCHA 켜기.

7. **[추천] Supabase 자동 보안 점검 돌려보기**
   `Advisors → Security Advisor` 실행 → 빨간 경고가 있으면 알려주세요. 같이 고쳐요.
   (RLS 누락 같은 걸 자동으로 잡아줌)

## 🔁 앞으로 주기적으로
- 새 테이블을 만들 때마다 **반드시 RLS를 켜고 정책을 추가** (안 켜면 그 테이블만 통째로 노출됨)
- `service_role` 키는 **절대** 프론트엔드 코드/`.env.local`/깃에 넣지 않기 (서버 함수에서만)
- 분기마다 Security Advisor 한 번씩 돌리기

---
점검일: 2026-07-01 · 점검 도구: 코드 정적 분석 + 실제 REST API 침투 테스트 + Supabase 공식 프로덕션 체크리스트
