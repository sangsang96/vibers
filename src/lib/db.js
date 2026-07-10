// ============================================================
//  데이터 접근 레이어 — 작품/댓글/좋아요/라이선스
//  · 실제 Supabase 연결 시: projects/comments/likes/licenses 테이블 사용
//    (테이블은 supabase/schema_marketplace.sql 로 생성)
//  · 키 없는 미리보기(mock) 모드: 메모리 배열로 동일하게 동작(새로고침 시 초기화)
//  화면(App.jsx)은 이 함수들만 호출하므로, 모드가 바뀌어도 UI 코드는 그대로입니다.
// ============================================================
import { supabase, isMock } from "./supabase";

// 댓글 DB행(username) → 화면이 쓰는 형태(who)로 정규화
const toComment = (r) => ({ id: r.id, who: r.username, text: r.text });

// ── 미리보기(mock) 메모리 스토어 ────────────────────────────
const SEED = [
  { id: 1, title: "구독 해지 방어 대시보드", cat: "웹앱", stacks: ["React", "Supabase"], demo: "https://example.com/d1", github: "https://github.com/supabase/supabase", builder: "indiebuilder", hue: 18, story: "주말에 우리 서비스 이탈률 보다가 빡쳐서 만든 리텐션 대시보드. 이탈 점수 자동 계산.", likes: 142, comments: 18, demo_clicks: 12, github_clicks: 5 },
  { id: 2, title: "인스타 릴스 자동 생성 봇", cat: "자동화/봇", stacks: ["n8n", "Python"], demo: "https://example.com/d2", github: "https://github.com/n8n-io/n8n", builder: "automate_kr", hue: 268, story: "키워드 넣으면 대본·자막·썸네일 만들어 예약 업로드. n8n 워크플로우 한 방.", likes: 301, comments: 44, demo_clicks: 30, github_clicks: 9 },
  { id: 3, title: "동네 모임 매칭 앱", cat: "모바일", stacks: ["Flutter", "Supabase"], demo: "https://example.com/d3", builder: "moim_dev", hue: 150, story: "혼자 살다 외로워서 만든 위치기반 소모임 매칭 앱. 그냥 구경용으로 공개해요.", likes: 88, comments: 7, demo_clicks: 4, github_clicks: 0 },
  { id: 4, title: "노션 회의록 자동 요약기", cat: "AI도구", stacks: ["Next.js", "TypeScript"], demo: "https://example.com/d4", builder: "pm_sang", hue: 38, story: "회의 녹음 던지면 노션에 액션아이템까지 정리. 매주 2시간 아낌.", likes: 256, comments: 31, demo_clicks: 21, github_clicks: 0 },
];
const mem = {
  projects: SEED.map((p) => ({ ...p })),
  comments: {},      // { [projectId]: [{id, who, text}] }
  likes: {},         // { [projectId]: true }
  licenses: [],
  seq: 1000,
};
const nextId = () => ++mem.seq;

// ── 작품 ────────────────────────────────────────────────────
export async function fetchProjects() {
  if (isMock) return mem.projects.map((p) => ({ ...p }));
  const { data, error } = await supabase
    .from("projects").select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }); // 생성시각이 같을 때(시드 등) 순서 고정
  if (error) throw error;
  return data || [];
}

export async function insertProject(proj, userId) {
  if (isMock) {
    const row = { ...proj, id: nextId(), likes: 0, comments: 0 };
    mem.projects.unshift(row);
    return { ...row };
  }
  const { builder_id, ...rest } = proj;
  const { data, error } = await supabase
    .from("projects").insert({ ...rest, builder_id: userId }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  if (isMock) {
    mem.projects = mem.projects.filter((p) => p.id !== id);
    delete mem.comments[id];
    return;
  }
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// ── 좋아요 ──────────────────────────────────────────────────
export async function fetchMyLikes(userId) {
  if (isMock) return Object.keys(mem.likes).map(Number);
  if (!userId) return [];
  const { data, error } = await supabase.from("likes").select("project_id").eq("user_id", userId);
  if (error) throw error;
  return (data || []).map((r) => r.project_id);
}

// on=true 면 이미 좋아요 상태 → 취소(delete), 아니면 추가(insert)
export async function toggleLike(projectId, userId, on) {
  if (isMock) {
    const p = mem.projects.find((x) => x.id === projectId);
    if (on) { delete mem.likes[projectId]; if (p) p.likes = Math.max(0, p.likes - 1); }
    else { mem.likes[projectId] = true; if (p) p.likes += 1; }
    return;
  }
  if (on) {
    const { error } = await supabase.from("likes").delete().eq("project_id", projectId).eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("likes").insert({ project_id: projectId, user_id: userId });
    if (error) throw error;
  }
}

// ── 댓글 ────────────────────────────────────────────────────
export async function fetchComments(projectId) {
  if (isMock) return (mem.comments[projectId] || []).map((c) => ({ ...c }));
  const { data, error } = await supabase
    .from("comments").select("*").eq("project_id", projectId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(toComment);
}

export async function addComment(projectId, userId, username, text) {
  if (isMock) {
    const row = { id: nextId(), who: username, text };
    mem.comments[projectId] = [...(mem.comments[projectId] || []), row];
    const p = mem.projects.find((x) => x.id === projectId);
    if (p) p.comments += 1;
    return { ...row };
  }
  const { data, error } = await supabase
    .from("comments").insert({ project_id: projectId, user_id: userId, username, text }).select().single();
  if (error) throw error;
  return toComment(data);
}

export async function deleteComment(projectId, commentId) {
  if (isMock) {
    mem.comments[projectId] = (mem.comments[projectId] || []).filter((c) => c.id !== commentId);
    const p = mem.projects.find((x) => x.id === projectId);
    if (p) p.comments = Math.max(0, p.comments - 1);
    return;
  }
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw error;
}

// ── 데모/깃허브 클릭 측정 ────────────────────────────────────
// 방문자가 "라이브 데모"나 "GitHub 소스" 버튼을 누르면 기록.
// 트리거(schema_clicks.sql)가 작품의 누적 카운트를 자동 +1 한다.
export async function trackClick(projectId, kind, userId) {
  if (isMock) {
    const p = mem.projects.find((x) => x.id === projectId);
    if (p) {
      if (kind === "demo") p.demo_clicks = (p.demo_clicks || 0) + 1;
      else p.github_clicks = (p.github_clicks || 0) + 1;
    }
    return;
  }
  const { error } = await supabase
    .from("clicks").insert({ project_id: projectId, kind, user_id: userId || null });
  if (error) throw error;
}

// ── 관리자: 통계 ────────────────────────────────────────────
// 가입자 수, 작품 수, 댓글/좋아요 수, 데모·깃허브 누적 클릭
export async function fetchStats() {
  if (isMock) {
    const comments = Object.values(mem.comments).reduce((s, a) => s + a.length, 0);
    const demoClicks = mem.projects.reduce((s, p) => s + (p.demo_clicks || 0), 0);
    const githubClicks = mem.projects.reduce((s, p) => s + (p.github_clicks || 0), 0);
    return {
      users: 0, projects: mem.projects.length, comments,
      likes: Object.keys(mem.likes).length, demoClicks, githubClicks, mock: true,
    };
  }
  // count 만 필요하므로 head:true 로 데이터 없이 개수만 받는다(빠름).
  const countOf = async (table) => {
    const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
    return count || 0;
  };
  const [users, projects, comments, likes] = await Promise.all([
    countOf("profiles"), countOf("projects"), countOf("comments"), countOf("likes"),
  ]);
  // 누적 클릭은 projects 의 카운트 컬럼 합산 (컬럼이 없으면 0 — schema_clicks.sql 실행 전)
  let demoClicks = 0, githubClicks = 0;
  const { data: rows } = await supabase.from("projects").select("demo_clicks, github_clicks");
  (rows || []).forEach((r) => {
    demoClicks += r.demo_clicks || 0;
    githubClicks += r.github_clicks || 0;
  });
  return { users, projects, comments, likes, demoClicks, githubClicks };
}

// ── 관리자: 전체 댓글 목록 (작품 제목 포함) ──────────────────
export async function fetchAllComments() {
  if (isMock) {
    return Object.entries(mem.comments).flatMap(([pid, arr]) => {
      const p = mem.projects.find((x) => x.id === Number(pid));
      return arr.map((c) => ({ ...c, itemId: Number(pid), itemTitle: p?.title || "(삭제된 작품)" }));
    });
  }
  const { data, error } = await supabase
    .from("comments")
    .select("id, project_id, username, text, created_at, projects(title)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, who: r.username, text: r.text,
    itemId: r.project_id, itemTitle: r.projects?.title || "(삭제된 작품)",
  }));
}

// ── 관리자: 사용자 목록 (username, role, 가입일, 작품수) ────────
export async function fetchUsers() {
  if (isMock) return [];
  const { data, error } = await supabase
    .from("profiles").select("id, username, role, created_at").order("created_at", { ascending: false });
  if (error) throw error;
  const { data: projs } = await supabase.from("projects").select("builder_id");
  const byUser = {};
  (projs || []).forEach((p) => { if (p.builder_id) byUser[p.builder_id] = (byUser[p.builder_id] || 0) + 1; });
  return (data || []).map((u) => ({ ...u, projectCount: byUser[u.id] || 0 }));
}

// ── 관리자: 사용자 완전 삭제 ────────────────────────────────
// 브라우저(anon)로는 남의 계정을 못 지우므로, 서버(Edge Function)에서
// "요청자가 admin 인지" 확인한 뒤 auth 계정까지 삭제한다.
// 함수 배포 방법: supabase/functions/delete-user/README 및 ADMIN_SETUP.md 참고.
export async function deleteUser(userId) {
  if (isMock) return; // 미리보기 모드에선 실제 삭제 없음
  const { data, error } = await supabase.functions.invoke("delete-user", { body: { userId } });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}
