// ============================================================
//  Supabase 클라이언트
//  · .env.local 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 있으면
//    → 진짜 Supabase Auth 에 연결됩니다.
//  · 키가 없으면 → 메모리 mock 클라이언트로 자동 폴백(시연/미리보기용).
//  설정 방법: 같은 폴더 상위의 SUPABASE_SETUP.md 참고.
// ============================================================
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 키가 둘 다 있어야 진짜 서버에 연결합니다.
export const isMock = !url || !anon;

// ── 미리보기용 내장 mock 인증 ───────────────────────────────
// 인증 서버가 쓰는 부분(auth, from().select().eq().single())만 흉내냅니다.
// 데이터는 메모리에만 저장되고 새로고침하면 초기화됩니다.
function createMockClient() {
  let session = null;
  const users = []; // { id, email, password, username, role }
  const listeners = [];
  const emit = () =>
    listeners.forEach((cb) => cb(session ? "SIGNED_IN" : "SIGNED_OUT", session));
  return {
    auth: {
      async getSession() {
        return { data: { session } };
      },
      onAuthStateChange(cb) {
        listeners.push(cb);
        return {
          data: {
            subscription: {
              unsubscribe() {
                const i = listeners.indexOf(cb);
                if (i >= 0) listeners.splice(i, 1);
              },
            },
          },
        };
      },
      async signUp({ email, password, options }) {
        if (users.find((u) => u.email === email))
          return {
            data: { session: null, user: null },
            error: { message: "User already registered" },
          };
        const username =
          (options && options.data && options.data.username) || email.split("@")[0];
        // 보안: 미리보기에서도 항상 일반 사용자로 가입한다.
        // (예전의 "닉네임 admin → 관리자" 백도어 제거. 관리자는 실제 DB에서만 지정)
        const role = "user";
        const user = { id: "u_" + (users.length + 1), email, password, username, role };
        users.push(user);
        session = { user: { id: user.id, email: user.email } };
        emit();
        return { data: { session, user: session.user }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = users.find((x) => x.email === email && x.password === password);
        if (!u)
          return {
            data: { session: null },
            error: { message: "Invalid login credentials" },
          };
        session = { user: { id: u.id, email: u.email } };
        emit();
        return { data: { session }, error: null };
      },
      async signOut() {
        session = null;
        emit();
        return { error: null };
      },
    },
    from() {
      const q = {
        _id: null,
        select() {
          return q;
        },
        eq(_col, val) {
          q._id = val;
          return q;
        },
        async single() {
          const u = users.find((x) => x.id === q._id);
          return {
            data: u ? { username: u.username, role: u.role } : null,
            error: u ? null : { message: "not found" },
          };
        },
      };
      return q;
    },
  };
}

export const supabase = isMock ? createMockClient() : createClient(url, anon);

if (isMock && typeof window !== "undefined") {
  if (import.meta.env.PROD) {
    // 배포 빌드인데 키가 없음 = 위험. mock 인증은 실서비스에 안전하지 않습니다.
    console.error(
      "[바이버스] ⚠️ 치명적: 배포 환경에 Supabase 키가 없어 임시(mock) 인증으로 동작합니다. " +
        "Vercel 프로젝트 설정 → Environment Variables 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 반드시 추가하고 재배포하세요."
    );
  } else {
    console.warn(
      "[바이버스] Supabase 키가 없어 mock 인증으로 동작합니다. " +
        "실제 연동은 SUPABASE_SETUP.md 를 참고해 .env.local 을 채워주세요."
    );
  }
}
