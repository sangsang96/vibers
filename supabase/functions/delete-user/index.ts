// ============================================================
//  Edge Function: delete-user
//  관리자만 다른 사용자를 완전히 삭제할 수 있게 하는 서버 함수.
//  · 브라우저(anon)로는 계정 삭제가 불가능하므로 이 함수가 대신 처리.
//  · service_role 키는 이 서버 안에서만 쓰이고 브라우저에 노출되지 않음.
//  · 반드시 "요청자가 admin 인지" 서버에서 확인한 뒤에만 삭제.
//
//  배포: Supabase 대시보드 → Edge Functions → Deploy, 또는
//        supabase functions deploy delete-user   (ADMIN_SETUP.md 참고)
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "로그인이 필요합니다." }, 401);
    const jwt = authHeader.replace("Bearer ", "");

    // service_role 클라이언트 (URL/키는 Supabase가 자동 주입)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) 요청자(호출자) 신원 확인
    const { data: { user: caller }, error: uErr } = await admin.auth.getUser(jwt);
    if (uErr || !caller) return json({ error: "세션이 유효하지 않습니다." }, 401);

    // 2) 요청자가 관리자(role='admin')인지 서버에서 검증 — 여기가 핵심 보안
    const { data: prof } = await admin
      .from("profiles").select("role").eq("id", caller.id).single();
    if (!prof || prof.role !== "admin") {
      return json({ error: "관리자 권한이 없습니다." }, 403);
    }

    // 3) 삭제 대상 확인
    const { userId } = await req.json().catch(() => ({}));
    if (!userId) return json({ error: "삭제할 사용자 ID가 없습니다." }, 400);
    if (userId === caller.id) {
      return json({ error: "본인 계정은 삭제할 수 없습니다." }, 400);
    }

    // 4) 계정 삭제 — auth.users 삭제 시 profiles/댓글/좋아요/라이선스는 자동 정리(cascade),
    //    해당 사용자의 작품은 남되 작성자 표시만 비워짐(builder_id → null).
    const { error: dErr } = await admin.auth.admin.deleteUser(userId);
    if (dErr) return json({ error: dErr.message }, 500);

    return json({ success: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
