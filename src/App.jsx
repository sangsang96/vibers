import React, { useState, useMemo, useEffect, useRef } from "react";
import { supabase, isMock } from "./lib/supabase";
import * as db from "./lib/db";

// ============================================================
//  바이버스(Vibers) — 뎁스 고도화 + Supabase 인증(회원가입/로그인)
//  · 레이어드 그림자 (ambient + key)
//  · 진입 staggered 모션 + 마이크로 인터랙션
//  · 피드(밀도) / 상세·페이월(여백) 리듬 대비
//  · Gumroad 스타일 페이월 (백드롭 블러 + 스프링 등장)
//  · 회원가입/로그인: Supabase Auth (이메일+비밀번호)
//  · 관리자: 하드코딩 비번 제거 → 서버 profiles.role='admin' 기반
//  실제 연동 방법은 SUPABASE_SETUP.md 를 참고하세요.
// ============================================================

// 카테고리는 이제 관리자가 편집 가능 → DB에서 불러옴. 이건 기본값(폴백).
const DEFAULT_CATS = ["웹앱", "모바일", "자동화/봇", "크롬확장", "AI도구", "기타"];
const STACKS = ["React", "Next.js", "Python", "n8n", "LangGraph", "Supabase", "Flutter", "TypeScript"];

function useIsMobile(bp = 720) {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < bp : false);
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [bp]);
  return m;
}

// ── 인증 상태 훅 ────────────────────────────────────────────
// session: 로그인 세션, user: 유저 객체, profile: profiles 테이블 행(username, role)
// isAdmin: 서버 profiles.role === "admin" 일 때만 true (클라이언트에서 위조 불가)
function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // 세션이 바뀌면 본인 프로필(=username, role)을 서버에서 다시 읽는다.
  useEffect(() => {
    if (!supabase || !session?.user) { setProfile(null); return; }
    let active = true;
    supabase
      .from("profiles")
      .select("username, role")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => { if (active) setProfile(data); });
    return () => { active = false; };
  }, [session]);

  return {
    session,
    user: session?.user || null,
    profile,
    username: profile?.username || session?.user?.email?.split("@")[0] || null,
    isAdmin: profile?.role === "admin",
    loading,
  };
}

export default function App() {
  const auth = useAuth();
  const { user, username, isAdmin } = auth;

  const [view, setView] = useState("feed");
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("전체");
  const [toast, setToast] = useState("");
  const [liked, setLiked] = useState({});      // { [작품id]: true } — 내가 누른 작품
  const [saved, setSaved] = useState({});       // { [작품id]: true } — 내가 보관한 작품
  const [cats, setCats] = useState(DEFAULT_CATS); // 카테고리 목록(관리자 편집)
  const [comments, setComments] = useState({}); // { [작품id]: [{id, who, text}] }
  const [authNext, setAuthNext] = useState(null); // 로그인 후 돌아갈 view
  const [stats, setStats] = useState(null);   // 관리자 통계
  const [users, setUsers] = useState([]);     // 관리자: 사용자 목록
  const [adminComments, setAdminComments] = useState([]); // 관리자: 전체 댓글
  const isMobile = useIsMobile();

  const flash = (t) => { setToast(t); setTimeout(() => setToast(""), 2800); };

  // 작품 목록은 처음 한 번 서버에서 불러온다.
  useEffect(() => {
    let active = true;
    db.fetchProjects()
      .then((rows) => { if (active) setItems(rows); })
      .catch(() => { if (active) flash("작품을 불러오지 못했습니다. (테이블이 생성됐는지 확인)"); });
    db.fetchCategories().then((cs) => { if (active && cs.length) setCats(cs); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // 로그인 상태가 바뀌면 내가 누른 좋아요 / 보관한 작품을 다시 읽는다.
  useEffect(() => {
    let active = true;
    if (!user) { setLiked({}); setSaved({}); return; }
    db.fetchMyLikes(user.id).then((ids) => {
      if (active) setLiked(Object.fromEntries(ids.map((id) => [id, true])));
    }).catch(() => {});
    db.fetchMyBookmarks(user.id).then((ids) => {
      if (active) setSaved(Object.fromEntries(ids.map((id) => [id, true])));
    }).catch(() => {});
    return () => { active = false; };
  }, [user]);

  // 작품 상세를 열 때 해당 작품 댓글을 서버에서 읽어온다.
  const openDetail = (p) => {
    setSel(p);
    setView("detail");
    db.fetchComments(p.id)
      .then((cs) => setComments((prev) => ({ ...prev, [p.id]: cs })))
      .catch(() => {});
  };

  // 로그인 안 되어 있으면 인증 화면으로 보내고, 로그인 후 원래 하려던 곳으로 복귀
  const requireAuth = (next) => {
    if (user) return true;
    setAuthNext(next || view);
    setView("auth");
    flash("로그인이 필요합니다");
    return false;
  };

  // 관리자 전용: 작품 삭제 (UI 게이트 + 서버 RLS 정책으로 이중 보호)
  const deleteItem = async (id) => {
    try { await db.deleteProject(id); }
    catch { flash("삭제에 실패했습니다 (권한 확인)"); return; }
    setItems((it) => it.filter((p) => p.id !== id));
    setComments((cs) => { const n = { ...cs }; delete n[id]; return n; });
    flash("작품을 삭제했습니다");
  };
  // 관리자 전용: 댓글 삭제
  const deleteComment = async (itemId, cmtId) => {
    try { await db.deleteComment(itemId, cmtId); }
    catch { flash("삭제에 실패했습니다 (권한 확인)"); return; }
    setComments((cs) => ({ ...cs, [itemId]: (cs[itemId] || []).filter((c) => c.id !== cmtId) }));
    setAdminComments((cs) => cs.filter((c) => c.id !== cmtId));
    setItems((it) => it.map((p) => p.id === itemId ? { ...p, comments: Math.max(0, p.comments - 1) } : p));
    flash("댓글을 삭제했습니다");
  };

  // 관리자 화면에 들어오고 권한이 있을 때만 통계·사용자 목록을 불러온다.
  const loadAdminData = () => {
    db.fetchStats().then(setStats).catch(() => {});
    db.fetchUsers().then(setUsers).catch(() => {});
    db.fetchAllComments().then(setAdminComments).catch(() => {});
  };
  useEffect(() => {
    if (view === "admin" && isAdmin) loadAdminData();
  }, [view, isAdmin]);

  // 관리자 전용: 사용자 완전 삭제 (Edge Function 경유 — 서버에서 관리자 검증)
  const deleteUser = async (id) => {
    try { await db.deleteUser(id); }
    catch (e) {
      const m = String(e?.message || "");
      if (/Function not found|not found|Failed to fetch|non-2xx/i.test(m))
        flash("사용자 삭제 함수가 아직 배포되지 않았습니다 (ADMIN_SETUP.md 참고)");
      else flash("사용자 삭제 실패: " + (m || "권한 확인"));
      return;
    }
    setUsers((us) => us.filter((u) => u.id !== id));
    flash("사용자를 삭제했습니다");
    loadAdminData();
    db.fetchProjects().then(setItems).catch(() => {}); // 작성자 표시 갱신
  };

  const filtered = useMemo(() =>
    items.filter((p) => {
      if (cat !== "전체" && p.cat !== cat) return false;
      if (q && !(p.title + p.story + p.stacks.join(" ")).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }), [items, cat, q]);

  // 한 사람당 한 번: 이미 눌렀으면 취소(-1), 아니면 +1 (로그인 필요)
  // 화면을 먼저 바꾸고(낙관적), 서버 반영이 실패하면 되돌린다.
  const like = (id) => {
    if (!requireAuth("feed")) return;
    const on = !!liked[id];
    setItems((it) => it.map((p) => p.id === id ? { ...p, likes: p.likes + (on ? -1 : 1) } : p));
    setLiked((lk) => { const n = { ...lk }; if (on) delete n[id]; else n[id] = true; return n; });
    db.toggleLike(id, user.id, on).catch(() => {
      setItems((it) => it.map((p) => p.id === id ? { ...p, likes: p.likes + (on ? 1 : -1) } : p));
      setLiked((lk) => { const n = { ...lk }; if (on) n[id] = true; else delete n[id]; return n; });
      flash("좋아요 처리에 실패했습니다");
    });
  };

  // 보관함 저장/해제 (로그인 필요) — 화면 먼저 바꾸고 서버 반영
  const toggleSave = (id) => {
    if (!requireAuth("feed")) return;
    const on = !!saved[id];
    setSaved((s) => { const n = { ...s }; if (on) delete n[id]; else n[id] = true; return n; });
    db.toggleBookmark(id, user.id, on).catch(() => {
      setSaved((s) => { const n = { ...s }; if (on) n[id] = true; else delete n[id]; return n; });
      flash("보관 처리에 실패했습니다");
    });
    flash(on ? "보관함에서 뺐어요" : "보관함에 담았어요");
  };

  // 관리자: 카테고리 추가/삭제
  const addCat = async (name) => {
    const n = name.trim();
    if (!n || cats.includes(n)) return;
    try { await db.addCategory(n); setCats((c) => [...c, n]); flash("카테고리를 추가했어요"); }
    catch { flash("카테고리 추가 실패 (권한 확인)"); }
  };
  const deleteCat = async (name) => {
    try { await db.deleteCategory(name); setCats((c) => c.filter((x) => x !== name)); flash("카테고리를 삭제했어요"); }
    catch { flash("카테고리 삭제 실패 (권한 확인)"); }
  };

  const addComment = async (id, text) => {
    if (!requireAuth("detail")) return;
    try {
      const row = await db.addComment(id, user.id, username, text);
      setComments((cs) => ({ ...cs, [id]: [...(cs[id] || []), row] }));
      setItems((it) => it.map((p) => p.id === id ? { ...p, comments: p.comments + 1 } : p));
    } catch { flash("댓글 등록에 실패했습니다"); }
  };

  // 데모/깃허브 버튼 클릭 측정 — 화면 카운트를 먼저 올리고 서버에 기록
  const trackClick = (p, kind) => {
    const key = kind === "demo" ? "demo_clicks" : "github_clicks";
    setItems((it) => it.map((x) => x.id === p.id ? { ...x, [key]: (x[key] || 0) + 1 } : x));
    db.trackClick(p.id, kind, user?.id).catch(() => {});
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    flash("로그아웃했습니다");
    setView("feed");
  };

  return (
    <div style={S.app}>
      <style>{CSS}</style>
      <div style={S.grain} />
      {isMock && <MockBanner />}
      <Header
        view={view} setView={setView} savedCount={Object.keys(saved).length}
        user={user} username={username} isAdmin={isAdmin}
        onShare={() => requireAuth("share") && setView("share")}
        onLogout={logout}
        onLogin={() => { setAuthNext("feed"); setView("auth"); }}
      />
      <main style={S.main}>
        {view === "feed" && (
          <Feed list={filtered} q={q} setQ={setQ} cat={cat} setCat={setCat} cats={cats}
            onOpen={openDetail} onLike={like} liked={liked} onSave={toggleSave} saved={saved} total={items.length} />
        )}
        {view === "saved" && (
          <Bookmarks list={items.filter((p) => saved[p.id])} onOpen={openDetail}
            onLike={like} liked={liked} onSave={toggleSave} saved={saved} />
        )}
        {view === "detail" && sel && (
          <Detail p={items.find((x) => x.id === sel.id) || sel} onBack={() => setView("feed")}
            onLike={like} liked={liked} comments={comments[sel.id] || []} onComment={addComment}
            onTrack={trackClick} isMobile={isMobile} canWrite={!!user}
            onSave={toggleSave} isSaved={!!saved[sel.id]} />
        )}
        {view === "auth" && (
          <Auth onDone={() => { setView(authNext || "feed"); setAuthNext(null); flash("환영합니다 🎉"); }}
            onCancel={() => setView("feed")} />
        )}
        {view === "share" && (
          <Share builder={username} cats={cats} onSubmit={async (proj) => {
            try {
              const row = await db.insertProject({ ...proj, hue: (proj.title.length * 37) % 360 }, user.id);
              setItems((ps) => [row, ...ps]);
              flash("작품이 피드에 공개됐습니다 🎉"); setView("feed");
            } catch { flash("작품 공개에 실패했습니다"); }
          }} />
        )}
        {view === "mine" && <Mine items={items} username={username} />}
        {view === "admin" && (
          <Admin isAdmin={isAdmin} user={user} onGoLogin={() => { setAuthNext("admin"); setView("auth"); }}
            items={items} allComments={adminComments} onDeleteItem={deleteItem} onDeleteComment={deleteComment}
            stats={stats} users={users} onDeleteUser={deleteUser}
            cats={cats} onAddCat={addCat} onDeleteCat={deleteCat} />
        )}
      </main>
      {toast && <div style={S.toast} className="toast-in">{toast}</div>}
      <footer style={S.footer}>
        공유·데모·오픈소스는 무료 — 커뮤니티 먼저, 상업적 이용은 준비 중
        <span style={S.footerSep}>·</span>
        <button onClick={() => setView("admin")} style={S.footerAdmin} className="link">관리자</button>
      </footer>
    </div>
  );
}

function MockBanner() {
  return (
    <div style={S.mockBanner}>
      ⚙️ <b>미리보기 모드</b> — Supabase 키가 없어 임시(mock) 인증으로 동작 중입니다.
      가입 데이터는 새로고침 시 사라져요. 실제 연동은 <code style={S.mockCode}>SUPABASE_SETUP.md</code> 참고.
    </div>
  );
}

function Header({ view, setView, savedCount, user, username, isAdmin, onShare, onLogout, onLogin }) {
  const Tab = ({ id, label, badge }) => (
    <button onClick={() => setView(id)} className="tab"
      style={{ ...S.tab, ...(view === id ? S.tabActive : {}) }}>
      {label}{badge ? <span style={S.badge}>{badge}</span> : null}
    </button>
  );
  return (
    <header style={S.header} className="header-blur">
      <div style={S.headerTop}>
        <div style={S.brand} onClick={() => setView("feed")}>
          <span style={S.brandMark}>◧</span>
          <span style={S.brandName}>바이브스테이지</span>
          <span style={S.brandSub}>/ stage</span>
        </div>
        <div style={S.headerRight}>
          {user ? (
            <>
              <span style={S.userChip}>
                @{username}{isAdmin && <span style={S.adminTag}>관리자</span>}
              </span>
              <button onClick={onLogout} style={S.ghostBtn} className="chip">로그아웃</button>
              <button onClick={onShare} style={S.cta} className="cta glow">+ 작품 자랑하기</button>
            </>
          ) : (
            <>
              <button onClick={onLogin} style={S.ghostBtn} className="chip">로그인 / 회원가입</button>
              <button onClick={onShare} style={S.cta} className="cta glow">+ 작품 자랑하기</button>
            </>
          )}
        </div>
      </div>
      <nav style={S.nav} className="tabscroll">
        <Tab id="feed" label="쇼케이스" />
        <Tab id="saved" label="보관함" badge={savedCount || null} />
        <Tab id="mine" label="내 작품" />
      </nav>
    </header>
  );
}

// ── 회원가입 / 로그인 화면 ──────────────────────────────────
function Auth({ onDone, onCancel }) {
  const [mode, setMode] = useState("signup"); // "signup" | "login"
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pwOk = pw.length >= 8;
  const usernameOk = /^[a-zA-Z0-9_]{3,20}$/.test(username.trim());

  // 비밀번호 강도(시각 피드백용): 길이/대문자/숫자/특수문자
  const pwScore = [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^A-Za-z0-9]/.test(pw)]
    .filter(Boolean).length;

  const valid = mode === "login"
    ? emailOk && pw.length > 0
    : emailOk && pwOk && usernameOk && pw === pw2;

  const submit = async () => {
    setErr(""); setInfo("");
    if (!supabase) {
      setErr("Supabase가 설정되지 않았습니다. .env.local에 URL과 anon 키를 넣어주세요.");
      return;
    }
    if (!valid) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        // 비밀번호 해싱·저장·세션은 전부 Supabase 서버가 처리합니다.
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pw,
          options: { data: { username: username.trim() } }, // profiles 트리거에서 사용
        });
        if (error) throw error;
        // 이메일 확인이 켜져 있으면 session이 없습니다 → 메일 인증 안내
        if (!data.session) {
          setInfo("가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 인증을 완료해주세요.");
          setBusy(false);
          return;
        }
        onDone();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pw,
        });
        if (error) throw error;
        onDone();
      }
    } catch (e) {
      // 보안상 "이메일이 없음/비번 틀림"을 구분해서 알려주지 않습니다.
      const msg = String(e?.message || "");
      if (/already registered|already exists/i.test(msg)) setErr("이미 가입된 이메일입니다. 로그인해주세요.");
      else if (/invalid login credentials/i.test(msg)) setErr("이메일 또는 비밀번호가 올바르지 않습니다.");
      else if (/duplicate key|profiles_username/i.test(msg)) setErr("이미 사용 중인 닉네임입니다. 다른 닉네임을 골라주세요.");
      else if (/rate/i.test(msg)) setErr("시도가 너무 많습니다. 잠시 후 다시 시도해주세요.");
      else setErr("처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setBusy(false);
    }
  };

  const switchMode = (m) => { setMode(m); setErr(""); setInfo(""); };

  return (
    <div style={S.authWrap} className="rise">
      <div style={S.authTabs} className="rise-1">
        <button onClick={() => switchMode("signup")}
          style={{ ...S.authTab, ...(mode === "signup" ? S.authTabOn : {}) }}>회원가입</button>
        <button onClick={() => switchMode("login")}
          style={{ ...S.authTab, ...(mode === "login" ? S.authTabOn : {}) }}>로그인</button>
      </div>

      <h1 style={S.formH1} className="rise-1">{mode === "signup" ? "바이브스테이지 시작하기" : "다시 오셨네요"}</h1>
      <p style={S.formSub} className="rise-2">
        {mode === "signup"
          ? "작품을 무대에 올리고 댓글·좋아요를 남기려면 가입이 필요해요. 30초면 끝나요."
          : "이메일과 비밀번호로 로그인하세요."}
      </p>

      <div className="rise-3">
        <Field label="이메일">
          <input style={{ ...S.in, borderColor: email && !emailOk ? C.accent : undefined }}
            type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          {email && !emailOk && <span style={S.errText}>올바른 이메일 형식이 아닙니다.</span>}
        </Field>

        {mode === "signup" && (
          <Field label="닉네임 (영문·숫자·_ , 3~20자)">
            <input style={{ ...S.in, borderColor: username && !usernameOk ? C.accent : undefined }}
              value={username} onChange={(e) => setUsername(e.target.value)} placeholder="indiebuilder" />
            {username && !usernameOk && <span style={S.errText}>영문/숫자/밑줄(_)만, 3~20자로 입력해주세요.</span>}
          </Field>
        )}

        <Field label="비밀번호 (8자 이상)">
          <div style={S.pwWrap}>
            <input style={{ ...S.in, paddingRight: 64, borderColor: pw && !pwOk ? C.accent : undefined }}
              type={showPw ? "text" : "password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && valid && submit()}
              placeholder="••••••••" />
            <button type="button" onClick={() => setShowPw((v) => !v)} style={S.pwToggle} className="link">
              {showPw ? "숨김" : "표시"}
            </button>
          </div>
          {mode === "signup" && pw && (
            <div style={S.pwMeterRow}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} style={{ ...S.pwMeterSeg, background: i < pwScore ? pwScoreColor(pwScore) : C.line }} />
              ))}
              <span style={{ ...S.pwMeterLabel, color: pwScoreColor(pwScore) }}>{pwScoreText(pwScore)}</span>
            </div>
          )}
          {pw && !pwOk && <span style={S.errText}>비밀번호는 8자 이상이어야 합니다.</span>}
        </Field>

        {mode === "signup" && (
          <Field label="비밀번호 확인">
            <input style={{ ...S.in, borderColor: pw2 && pw !== pw2 ? C.accent : undefined }}
              type={showPw ? "text" : "password"} autoComplete="new-password" value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && valid && submit()}
              placeholder="••••••••" />
            {pw2 && pw !== pw2 && <span style={S.errText}>비밀번호가 일치하지 않습니다.</span>}
          </Field>
        )}

        {err && <div style={S.authError}>{err}</div>}
        {info && <div style={S.authInfo}>{info}</div>}

        <button disabled={!valid || busy} onClick={submit}
          style={{ ...S.cta, width: "100%", marginTop: 8, opacity: (valid && !busy) ? 1 : 0.45 }} className="cta glow">
          {busy ? "처리 중…" : (mode === "signup" ? "가입하기" : "로그인")}
        </button>

        <div style={S.authSwitch}>
          {mode === "signup" ? (
            <>이미 계정이 있나요? <button className="link" style={S.linkBtn} onClick={() => switchMode("login")}>로그인</button></>
          ) : (
            <>처음이신가요? <button className="link" style={S.linkBtn} onClick={() => switchMode("signup")}>회원가입</button></>
          )}
          <span style={S.footerSep}>·</span>
          <button className="link" style={S.linkBtn} onClick={onCancel}>둘러보기로 돌아가기</button>
        </div>

        <p style={S.note}>
          비밀번호는 바이브스테이지 서버에 저장되지 않습니다. Supabase가 해싱하여 안전하게 관리합니다.
        </p>
      </div>
    </div>
  );
}

const pwScoreColor = (s) => (s <= 1 ? "#c4543a" : s === 2 ? "#b8862b" : s === 3 ? "#5b8c5a" : "#2e7d4f");
const pwScoreText = (s) => (s <= 1 ? "약함" : s === 2 ? "보통" : s === 3 ? "좋음" : "강함");

function Feed({ list, q, setQ, cat, setCat, cats, onOpen, onLike, liked, onSave, saved, total }) {
  const chips = ["전체", ...cats];
  return (
    <div>
      <section style={S.hero} className="rise" >
        <div style={S.heroGlow} />
        <h1 style={S.h1} className="rise-1">내가 만든 거,<br /><em style={S.em}>일단 자랑부터.</em></h1>
        <p style={S.heroP} className="rise-2">
          바이브 코딩으로 만든 작품을 무대에 올리고, 서로 데모를 써보고, 오픈소스로 가져가세요.
          전부 무료예요. <b>상업적 이용</b>은 빌더에게 수익이 돌아가는 방식으로 곧 열립니다.
          현재 <b>{total}개</b> 작품 공개 중.
        </p>
        <div className="rise-3">
          <input style={S.search} placeholder="검색 — 자동화, 대시보드, n8n…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={S.cats}>
            {chips.map((c) => (
              <button key={c} onClick={() => setCat(c)} className="chip"
                style={{ ...S.catChip, ...(cat === c ? S.catChipActive : {}) }}>{c}</button>
            ))}
          </div>
        </div>
      </section>

      <section style={S.grid}>
        {list.map((p, i) => (
          <Card key={p.id} p={p} i={i} onOpen={onOpen} onLike={onLike} isLiked={!!liked[p.id]}
            onSave={onSave} isSaved={!!saved[p.id]} />
        ))}
        {list.length === 0 && <p style={S.empty}>조건에 맞는 작품이 없습니다.</p>}
      </section>
    </div>
  );
}

function Card({ p, i, onOpen, onLike, isLiked, onSave, isSaved }) {
  const [burst, setBurst] = useState(false);
  const doLike = (e) => {
    e.stopPropagation();
    if (!isLiked) { setBurst(true); setTimeout(() => setBurst(false), 500); }
    onLike(p.id);
  };
  const doSave = (e) => { e.stopPropagation(); onSave(p.id); };
  return (
    <article style={{ ...S.card, animationDelay: `${i * 70}ms` }} className="card card-rise">
      <div style={{ ...S.cardThumb, background: thumbGrad(p.hue) }} onClick={() => onOpen(p)}>
        <div style={S.thumbSheen} className="sheen" />
        <span style={S.thumbCat}>{p.cat}</span>
        <span style={{ ...S.thumbGlyph, color: `hsl(${p.hue} 40% 55% / .55)` }}>◨</span>
        {p.github
          ? <span style={S.freeBadge}>오픈소스</span>
          : <span style={S.viewBadge}>구경용 공개</span>}
      </div>
      <div style={S.cardBody} onClick={() => onOpen(p)}>
        <div style={S.builderRow}>@{p.builder}</div>
        <h3 style={S.cardTitle}>{p.title}</h3>
        <p style={S.cardDesc}>{p.story}</p>
        <div style={S.tagRow}>{p.stacks.map((s) => <span key={s} style={S.tag}>{s}</span>)}</div>
      </div>
      <div style={S.cardFoot}>
        <div style={S.footLeft}>
          <button className="reactBtn" style={{ ...S.reactBtn, color: isLiked ? C.accent : C.sub, fontWeight: isLiked ? 700 : 600 }} onClick={doLike}>
            <span style={{ position: "relative" }}>
              {isLiked ? "♥" : "♡"} {burst && <span style={S.heartBurst} className="burst">♥</span>}
            </span> {p.likes}
          </button>
          <button className="reactBtn" title={isSaved ? "보관함에서 빼기" : "보관함에 담기"}
            style={{ ...S.reactBtn, color: isSaved ? C.gold : C.sub, fontWeight: isSaved ? 700 : 600 }} onClick={doSave}>
            {isSaved ? "🔖" : "🏷"} 보관
          </button>
        </div>
        <span style={S.meta}>💬 {p.comments} · ▶ {p.demo_clicks || 0}</span>
      </div>
    </article>
  );
}

function Bookmarks({ list, onOpen, onLike, liked, onSave, saved }) {
  return (
    <div className="rise">
      <h1 style={S.formH1} className="rise-1">보관함</h1>
      <p style={S.formSub} className="rise-2">나중에 써볼 작품을 담아두는 곳. 카드의 🏷 보관 버튼으로 추가할 수 있어요.</p>
      {list.length === 0 ? (
        <p style={S.empty}>아직 보관한 작품이 없어요. 쇼케이스에서 마음에 드는 작품을 🏷 보관해보세요.</p>
      ) : (
        <section style={S.grid}>
          {list.map((p, i) => (
            <Card key={p.id} p={p} i={i} onOpen={onOpen} onLike={onLike} isLiked={!!liked[p.id]}
              onSave={onSave} isSaved={!!saved[p.id]} />
          ))}
        </section>
      )}
    </div>
  );
}

function Detail({ p, onBack, onLike, liked, comments, onComment, onTrack, isMobile, canWrite, onSave, isSaved }) {
  const isLiked = !!liked[p.id];
  const [showCmt, setShowCmt] = useState(false);
  const [draft, setDraft] = useState("");
  const cmtRef = useRef(null);

  const openComment = () => {
    setShowCmt(true);
    setTimeout(() => cmtRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    setTimeout(() => cmtRef.current?.focus(), 200);
  };
  const submit = () => {
    if (!draft.trim()) return;
    onComment(p.id, draft.trim());
    setDraft("");
  };

  const gridStyle = isMobile
    ? { display: "flex", flexDirection: "column", gap: 24 }
    : S.detailGrid;
  const asideStyle = isMobile
    ? { ...S.buyBox, position: "static", top: "auto", order: -1 }
    : S.buyBox;

  return (
    <div style={S.detailWrap}>
      <button onClick={onBack} style={S.back} className="link">← 쇼케이스로</button>
      <div style={gridStyle}>
        <div className="rise">
          <div style={{ ...S.detailHero, background: thumbGrad(p.hue) }} className="rise-1">
            <div style={S.thumbSheen} className="sheen" />
            <span style={{ ...S.thumbGlyphLg, color: `hsl(${p.hue} 40% 55% / .5)` }}>◨</span>
          </div>
          <div style={S.builderRow} className="rise-2">@{p.builder} 의 작품</div>
          <h1 style={S.detailTitle} className="rise-2">{p.title}</h1>
          <p style={S.detailDesc} className="rise-3">{p.story}</p>
          <div style={S.reactBar} className="rise-3">
            <button className="reactBtnLg"
              style={{ ...S.reactBtnLg, background: isLiked ? "#f3dfd8" : C.chip, color: isLiked ? C.accentDark : C.ink }}
              onClick={() => onLike(p.id)}>
              {isLiked ? "♥" : "♡"} 좋아요 {p.likes}
            </button>
            <button className="reactBtnLg" style={S.reactBtnLg} onClick={openComment}>💬 댓글 {p.comments}</button>
            <button className="reactBtnLg"
              style={{ ...S.reactBtnLg, background: isSaved ? "#f7ecd4" : C.chip, color: isSaved ? C.gold : C.ink }}
              onClick={() => onSave(p.id)}>
              {isSaved ? "🔖 보관됨" : "🏷 보관하기"}
            </button>
          </div>
          <h4 style={S.secTitle}>기술 스택</h4>
          <div style={S.tagRow}>{p.stacks.map((s) => <span key={s} style={S.tag}>{s}</span>)}</div>

          <h4 style={S.secTitle}>댓글 {p.comments}</h4>
          <div style={S.cmtInputRow}>
            <input ref={cmtRef} style={{ ...S.in, flex: 1 }} value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={canWrite ? "댓글을 남겨보세요" : "댓글을 쓰려면 로그인하세요"} />
            <button onClick={submit} style={{ ...S.cta, opacity: draft.trim() ? 1 : 0.45 }} className="cta">등록</button>
          </div>
          {comments.map((c) => (
            <div key={c.id} style={S.comment}><b>@{c.who}</b> {c.text}</div>
          ))}
          <div style={S.comment}><b>@curious_dev</b> 이거 어떻게 만든 거예요? 미쳤다 👏</div>
          <div style={S.comment}><b>@startup_lee</b> 우리 회사에 쓰고 싶은데 상업용 라이선스 있나요?</div>
        </div>

        <aside style={asideStyle} className="rise-2">
          <a href={p.demo} target="_blank" rel="noreferrer" style={S.demoBtn} className="cta"
            onClick={() => onTrack(p, "demo")}>
            ▶ 라이브 데모 체험 <span style={S.freePill}>무료</span>
          </a>
          {p.github ? (
            <a href={p.github} target="_blank" rel="noreferrer" style={S.ghBtn} className="cta"
              onClick={() => onTrack(p, "github")}>
              ⎇ GitHub 소스 보기 <span style={S.osPill}>오픈소스</span>
            </a>
          ) : (
            <div style={S.noGh}>빌더가 아직 GitHub 링크를 공개하지 않았어요.</div>
          )}
          <div style={S.clickRow}>
            <span style={S.clickStat}>▶ 데모 체험 <b>{(p.demo_clicks || 0).toLocaleString("ko-KR")}</b>회</span>
            <span style={S.clickStat}>⎇ 소스 방문 <b>{(p.github_clicks || 0).toLocaleString("ko-KR")}</b>회</span>
          </div>
          <div style={S.gateBox}>
            <div style={S.gateLabel}>이용 안내</div>
            <div style={S.noComm}>
              구경·데모 체험·오픈소스 활용까지 전부 <b>무료</b>입니다.
              <b> 상업적 이용</b>은 빌더 @{p.builder} 에게 수익이 정산되는 방식으로 준비 중이에요.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Share({ onSubmit, builder, cats }) {
  const [f, setF] = useState({ title: "", cat: cats[0] || "웹앱", story: "", demo: "", github: "", sns: [""], stacks: [] });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const toggleStack = (s) => setF((st) => ({ ...st, stacks: st.stacks.includes(s) ? st.stacks.filter((x) => x !== s) : [...st.stacks, s] }));
  const setSns = (i, v) => setF((s) => ({ ...s, sns: s.sns.map((x, idx) => idx === i ? v : x) }));
  const addSns = () => setF((s) => ({ ...s, sns: [...s.sns, ""] }));
  const removeSns = (i) => setF((s) => ({ ...s, sns: s.sns.filter((_, idx) => idx !== i) }));
  const demoOk = /^https?:\/\/.+\..+/.test(f.demo.trim());
  const valid = f.title.trim() && f.story.trim() && demoOk && f.stacks.length;
  return (
    <div style={S.formWrap} className="rise">
      <h1 style={S.formH1} className="rise-1">작품 자랑하기</h1>
      <p style={S.formSub} className="rise-2">
        공유는 무료입니다. GitHub 링크를 남기면 <b>오픈소스</b> 배지가 붙고, 다른 회원이 소스를 가져가 쓸 수 있어요. (게시자: @{builder})
      </p>
      <div className="rise-3">
        <Field label="제목"><input style={S.in} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="예: 구독 해지 방어 대시보드" /></Field>
        <Field label="카테고리"><select style={S.in} value={f.cat} onChange={(e) => set("cat", e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="메이킹 스토리 — 왜·어떻게 만들었나"><textarea style={{ ...S.in, minHeight: 90 }} value={f.story} onChange={(e) => set("story", e.target.value)} placeholder="자랑 포인트, 만든 계기, 핵심 기능을 자유롭게 적어주세요." /></Field>
        <Field label="라이브 데모 URL (필수)">
          <input style={{ ...S.in, borderColor: f.demo && !demoOk ? "#c4543a" : undefined }} value={f.demo} onChange={(e) => set("demo", e.target.value)} placeholder="https://..." />
          {f.demo && !demoOk && <span style={S.errText}>올바른 URL 형식이 아닙니다.</span>}
        </Field>
        <Field label="GitHub — 링크를 남기면 '오픈소스' 배지가 붙어요 (선택)">
          <input style={S.in} value={f.github} onChange={(e) => set("github", e.target.value)} placeholder="https://github.com/username/repo" />
        </Field>
        <Field label="SNS">
          {f.sns.map((url, i) => (
            <div key={i} style={S.snsRow}>
              <input style={{ ...S.in, flex: 1 }} value={url} onChange={(e) => setSns(i, e.target.value)} placeholder="https://x.com/... , 인스타·유튜브 등" />
              {f.sns.length > 1 && (
                <button onClick={() => removeSns(i)} style={S.snsDel} className="chip" aria-label="삭제">✕</button>
              )}
            </div>
          ))}
          <button onClick={addSns} style={S.snsAdd} className="chip">+ SNS 추가</button>
        </Field>
        <Field label="기술 스택">
          <div style={S.tagRow}>{STACKS.map((s) => (
            <button key={s} onClick={() => toggleStack(s)} className="chip" style={{ ...S.catChip, ...(f.stacks.includes(s) ? S.catChipActive : {}) }}>{s}</button>
          ))}</div>
        </Field>
        <button disabled={!valid} onClick={() => onSubmit({
          title: f.title.trim(), cat: f.cat, story: f.story.trim(), demo: f.demo.trim(),
          github: f.github.trim(), sns: f.sns.map((s) => s.trim()).filter(Boolean),
          stacks: f.stacks, builder: builder || "me",
        })} style={{ ...S.cta, width: "100%", marginTop: 8, opacity: valid ? 1 : 0.45 }} className="cta">무대에 올리기</button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label style={S.field}><span style={S.fieldLabel}>{label}</span>{children}</label>;
}

function Mine({ items, username }) {
  const mine = items.filter((p) => p.builder === username);
  return (
    <div style={S.formWrap} className="rise">
      <h1 style={S.formH1} className="rise-1">내 작품</h1>
      <p style={S.formSub} className="rise-2">
        다른 회원들이 내 작품을 얼마나 써봤는지 확인하세요. 데모 체험·소스 방문이 실시간으로 집계됩니다.
      </p>
      {mine.length === 0 ? <p style={S.empty}>아직 무대에 올린 작품이 없습니다. "작품 자랑하기"로 올려보세요.</p>
        : mine.map((p) => (
          <div key={p.id} style={S.msgCard}>
            <div style={S.msgHead}>
              <b>{p.title}</b>
              {p.github
                ? <span style={S.statusChip}>오픈소스</span>
                : <span style={S.statusChipPend}>구경용 공개</span>}
            </div>
            <div style={S.mineStats}>
              <span style={S.mineStat}>▶ 데모 체험 <b>{(p.demo_clicks || 0).toLocaleString("ko-KR")}</b>회</span>
              <span style={S.mineStat}>⎇ 소스 방문 <b>{(p.github_clicks || 0).toLocaleString("ko-KR")}</b>회</span>
              <span style={S.mineStat}>♥ 좋아요 <b>{p.likes}</b></span>
              <span style={S.mineStat}>💬 댓글 <b>{p.comments}</b></span>
            </div>
          </div>
        ))}
    </div>
  );
}

// ── 관리자 콘솔 ─────────────────────────────────────────────
// 더 이상 하드코딩 비밀번호가 없습니다. 권한은 서버의 profiles.role 로만 결정됩니다.
// 실제 삭제 보호는 반드시 Supabase RLS 정책으로 서버에서 한 번 더 막아야 합니다(문서 참고).
function Admin({ isAdmin, user, onGoLogin, items, allComments, onDeleteItem, onDeleteComment, stats, users, onDeleteUser, cats, onAddCat, onDeleteCat }) {
  const [confirmId, setConfirmId] = useState(null);
  const [newCat, setNewCat] = useState("");

  // 1) 비로그인
  if (!user) {
    return (
      <div style={S.adminLoginWrap} className="rise">
        <div style={S.adminLockBig} className="lock-pop">🔐</div>
        <h1 style={S.formH1}>관리자 전용</h1>
        <p style={S.formSub}>이 페이지는 관리자 계정만 접근할 수 있습니다. 먼저 로그인해주세요.</p>
        <button onClick={onGoLogin} style={{ ...S.cta, width: "100%", marginTop: 8 }} className="cta glow">로그인하러 가기</button>
      </div>
    );
  }

  // 2) 로그인했지만 관리자 권한 없음
  if (!isAdmin) {
    return (
      <div style={S.adminLoginWrap} className="rise">
        <div style={S.adminLockBig} className="lock-pop">⛔</div>
        <h1 style={S.formH1}>접근 권한 없음</h1>
        <p style={S.formSub}>
          이 계정에는 관리자 권한이 없습니다. 관리자 권한은 Supabase에서 해당 계정의
          <code style={S.code}> profiles.role </code>을 <code style={S.code}>'admin'</code>으로 설정해야 부여됩니다.
        </p>
      </div>
    );
  }

  // 3) 관리자 콘솔 (전체 댓글은 서버에서 통째로 받아온 allComments 사용)
  return (
    <div style={S.formWrap} className="rise">
      <div style={S.adminHead}>
        <h1 style={S.formH1}>관리자 콘솔</h1>
      </div>
      <p style={S.formSub}>서비스 현황을 보고, 부적절한 작품·댓글·사용자를 삭제할 수 있습니다. 삭제는 되돌릴 수 없습니다.</p>

      {/* ── 통계 대시보드 ── */}
      <h4 style={S.secTitle}>통계</h4>
      {!stats ? <p style={S.empty}>통계를 불러오는 중…</p> : (
        <div style={S.statGrid}>
          <StatCard label="가입 인원" value={stats.mock ? "—" : stats.users} icon="👤" hint={stats.mock ? "미리보기 모드" : "전체 회원"} />
          <StatCard label="등록 제품" value={stats.projects} icon="📦" hint="공개된 작품" />
          <StatCard label="댓글" value={stats.comments} icon="💬" />
          <StatCard label="좋아요" value={stats.likes} icon="♥" />
          <StatCard label="데모 체험" value={stats.demoClicks || 0} icon="▶" hint="누적 클릭" />
          <StatCard label="소스 방문" value={stats.githubClicks || 0} icon="⎇" hint="GitHub 이동" />
        </div>
      )}

      {/* ── 카테고리 관리 ── */}
      <h4 style={S.secTitle}>카테고리 관리 ({cats.length})</h4>
      <div style={S.catAdminRow}>
        {cats.map((c) => (
          <span key={c} style={S.catAdminChip}>
            {c}
            <button onClick={() => onDeleteCat(c)} style={S.catDel} title="삭제">✕</button>
          </span>
        ))}
      </div>
      <div style={S.catAddRow}>
        <input style={{ ...S.in, flex: 1 }} value={newCat} placeholder="새 카테고리 이름 (예: 게임)"
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newCat.trim()) { onAddCat(newCat); setNewCat(""); } }} />
        <button onClick={() => { if (newCat.trim()) { onAddCat(newCat); setNewCat(""); } }}
          style={{ ...S.cta, opacity: newCat.trim() ? 1 : 0.45 }} className="cta">추가</button>
      </div>
      <p style={S.note}>추가·삭제한 카테고리는 즉시 쇼케이스 필터와 작품 등록 화면에 반영됩니다.</p>

      <h4 style={S.secTitle}>작품 관리 ({items.length})</h4>
      {items.length === 0 ? <p style={S.empty}>등록된 작품이 없습니다.</p>
        : items.map((p) => (
          <div key={p.id} style={S.adminRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.adminRowTitle}>{p.title}</div>
              <div style={S.adminRowMeta}>@{p.builder} · {p.cat} · ♥ {p.likes} · 💬 {p.comments}</div>
            </div>
            {confirmId === `item-${p.id}` ? (
              <div style={S.confirmRow}>
                <button onClick={() => { onDeleteItem(p.id); setConfirmId(null); }} style={S.delConfirm} className="cta">삭제 확인</button>
                <button onClick={() => setConfirmId(null)} style={S.delCancel} className="chip">취소</button>
              </div>
            ) : (
              <button onClick={() => setConfirmId(`item-${p.id}`)} style={S.delBtn} className="chip">삭제</button>
            )}
          </div>
        ))}

      <h4 style={S.secTitle}>댓글 관리 ({allComments.length})</h4>
      {allComments.length === 0 ? <p style={S.empty}>삭제 가능한 사용자 댓글이 없습니다.</p>
        : allComments.map((c) => (
          <div key={c.id} style={S.adminRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.adminRowTitle}>@{c.who}: {c.text}</div>
              <div style={S.adminRowMeta}>작품: {c.itemTitle}</div>
            </div>
            {confirmId === `cmt-${c.id}` ? (
              <div style={S.confirmRow}>
                <button onClick={() => { onDeleteComment(c.itemId, c.id); setConfirmId(null); }} style={S.delConfirm} className="cta">삭제 확인</button>
                <button onClick={() => setConfirmId(null)} style={S.delCancel} className="chip">취소</button>
              </div>
            ) : (
              <button onClick={() => setConfirmId(`cmt-${c.id}`)} style={S.delBtn} className="chip">삭제</button>
            )}
          </div>
        ))}

      {/* ── 사용자 관리 ── */}
      <h4 style={S.secTitle}>사용자 관리 ({users.length})</h4>
      {users.length === 0 ? (
        <p style={S.empty}>표시할 사용자가 없습니다. (미리보기 모드에선 사용자 목록이 제공되지 않아요)</p>
      ) : users.map((u) => (
        <div key={u.id} style={S.adminRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.adminRowTitle}>
              @{u.username}
              {u.role === "admin" && <span style={S.adminTag}>관리자</span>}
              {u.id === user.id && <span style={S.meTag}>나</span>}
            </div>
            <div style={S.adminRowMeta}>
              작품 {u.projectCount}개
              {u.created_at && ` · 가입 ${new Date(u.created_at).toLocaleDateString("ko-KR")}`}
            </div>
          </div>
          {u.id === user.id ? (
            <span style={S.selfNote}>본인</span>
          ) : confirmId === `user-${u.id}` ? (
            <div style={S.confirmRow}>
              <button onClick={() => { onDeleteUser(u.id); setConfirmId(null); }} style={S.delConfirm} className="cta">삭제 확인</button>
              <button onClick={() => setConfirmId(null)} style={S.delCancel} className="chip">취소</button>
            </div>
          ) : (
            <button onClick={() => setConfirmId(`user-${u.id}`)} style={S.delBtn} className="chip">삭제</button>
          )}
        </div>
      ))}
      <p style={S.note}>
        사용자 삭제는 계정과 그 사용자의 댓글·좋아요·라이선스를 함께 지웁니다(작품은 남고 작성자 표시만 비워짐).
        되돌릴 수 없습니다.
      </p>
    </div>
  );
}

function StatCard({ label, value, icon, hint, wide }) {
  return (
    <div style={{ ...S.statCard, ...(wide ? S.statCardWide : {}) }}>
      <div style={S.statTop}><span style={S.statIcon}>{icon}</span><span style={S.statLabel}>{label}</span></div>
      <div style={S.statValue}>{value}</div>
      {hint && <div style={S.statHint}>{hint}</div>}
    </div>
  );
}

const thumbGrad = (h) => `linear-gradient(135deg, hsl(${h} 32% 88%), hsl(${(h+40)%360} 28% 80%))`;

// ============================================================
//  스타일
// ============================================================
const C = {
  bg: "#f1ede4", paper: "#fbfaf6", ink: "#1f1c18", sub: "#6b655c",
  line: "#e3ddd0", accent: "#c4543a", accentDark: "#9d3f2c", chip: "#efe9dd", gold: "#b8862b",
};
// 레이어드 그림자 (ambient + key)
const SH = {
  rest: "0 1px 2px rgba(31,28,24,.04), 0 4px 12px rgba(31,28,24,.05)",
  hover: "0 2px 4px rgba(31,28,24,.06), 0 18px 40px rgba(31,28,24,.14)",
  float: "0 4px 8px rgba(31,28,24,.06), 0 30px 60px rgba(31,28,24,.18)",
  modal: "0 10px 24px rgba(31,28,24,.18), 0 40px 90px rgba(31,28,24,.32)",
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap');
* { box-sizing: border-box; } body { margin: 0; }

@keyframes rise { from {opacity:0; transform: translateY(16px);} to {opacity:1; transform:none;} }
@keyframes cardRise { from {opacity:0; transform: translateY(22px) scale(.98);} to {opacity:1; transform:none;} }
.rise, .rise-1, .rise-2, .rise-3 { opacity:0; animation: rise .6s cubic-bezier(.2,.7,.2,1) forwards; }
.rise-1 { animation-delay: .05s; } .rise-2 { animation-delay: .14s; } .rise-3 { animation-delay: .24s; }
.card-rise { opacity:0; animation: cardRise .6s cubic-bezier(.2,.7,.2,1) forwards; }

.card { cursor:pointer; box-shadow: ${SH.rest}; transition: transform .25s cubic-bezier(.2,.7,.2,1), box-shadow .25s ease; }
.card:hover { transform: translateY(-6px); box-shadow: ${SH.hover}; }
.card:hover .sheen { transform: translateX(120%); }
.sheen { transition: transform .8s cubic-bezier(.2,.7,.2,1); }

.cta { transition: filter .15s, transform .12s, box-shadow .25s; }
.cta:hover { filter: brightness(1.07); transform: translateY(-1px); }
.cta:active { transform: scale(.97); }
.glow { box-shadow: 0 6px 18px rgba(196,84,58,.35); }
.glow:hover { box-shadow: 0 10px 28px rgba(196,84,58,.5); }

.chip { transition: all .18s; }
.reactBtn, .reactBtnLg { transition: transform .12s, color .18s, background .18s; }
.reactBtn:hover { color:#c4543a; transform: scale(1.06); }
.reactBtnLg:hover { background:#f3dfd8; transform: scale(1.03); }
@keyframes burst { 0%{opacity:1; transform:translate(-50%,-50%) scale(.4);} 100%{opacity:0; transform:translate(-50%,-160%) scale(1.6);} }
.burst { animation: burst .5s ease-out forwards; }

.tab { transition: color .15s, background .15s; } .tab:hover { color:#1f1c18; }
.link:hover { text-decoration: underline; }
.header-blur { backdrop-filter: blur(12px); }
.tabscroll::-webkit-scrollbar { display: none; }
.tabscroll { scrollbar-width: none; }

.backdrop-in { animation: bg .25s ease forwards; }
@keyframes bg { from{opacity:0;} to{opacity:1;} }
@keyframes spring { 0%{opacity:0; transform: translateY(30px) scale(.94);} 60%{transform: translateY(-4px) scale(1.005);} 100%{opacity:1; transform:none;} }
.modal-spring { animation: spring .5s cubic-bezier(.2,.8,.2,1) forwards; }
@keyframes lockPop { 0%{transform:scale(.4) rotate(-12deg); opacity:0;} 70%{transform:scale(1.15) rotate(4deg);} 100%{transform:scale(1) rotate(0); opacity:1;} }
.lock-pop { animation: lockPop .55s cubic-bezier(.2,.8,.2,1) .1s both; }
.plan-card { transition: transform .2s, box-shadow .2s, border-color .2s; cursor:pointer; }
.plan-card:hover { transform: translateY(-4px); box-shadow: ${SH.hover}; }
.plan-hot:hover { border-color:#c4543a; }

.toast-in { animation: toastUp .35s cubic-bezier(.2,.8,.2,1); }
@keyframes toastUp { from{opacity:0; transform: translate(-50%,24px);} to{opacity:1; transform: translate(-50%,0);} }

input,textarea,select { font-family:'IBM Plex Sans KR',sans-serif; }
input:focus,textarea:focus,select:focus { outline:2px solid #c4543a; outline-offset:1px; }
`;

const S = {
  app: { minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'IBM Plex Sans KR',sans-serif", position: "relative" },
  grain: { position: "fixed", inset: 0, pointerEvents: "none", opacity: .035, zIndex: 1,
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" },
  mockBanner: { position: "relative", zIndex: 30, background: "#fdf3df", borderBottom: "1px solid #ecd9a8", color: "#7a5a12", fontSize: 12.5, lineHeight: 1.5, padding: "9px 18px", textAlign: "center" },
  mockCode: { background: "#f3e6c4", padding: "1px 6px", borderRadius: 5, fontFamily: "monospace", fontSize: 12 },
  header: { display: "flex", flexDirection: "column", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${C.line}`, background: "rgba(251,250,246,.78)", position: "sticky", top: 0, zIndex: 20 },
  headerTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  headerRight: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  userChip: { fontSize: 13, color: C.ink, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" },
  adminTag: { background: C.accent, color: "#fff", borderRadius: 20, fontSize: 10.5, fontWeight: 700, padding: "1px 7px" },
  ghostBtn: { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 13px", fontSize: 13, color: C.sub, cursor: "pointer", whiteSpace: "nowrap" },
  brand: { fontFamily: "Fraunces,serif", fontWeight: 900, fontSize: 22, cursor: "pointer", display: "flex", gap: 7, alignItems: "baseline", whiteSpace: "nowrap", flexShrink: 0 },
  brandMark: { color: C.accent, fontSize: 24, alignSelf: "center" },
  brandName: { whiteSpace: "nowrap" },
  brandSub: { fontFamily: "'IBM Plex Sans KR'", fontWeight: 400, fontSize: 12, color: C.sub, whiteSpace: "nowrap" },
  nav: { display: "flex", alignItems: "center", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch" },
  tab: { background: "none", border: "none", padding: "8px 14px", fontSize: 14, color: C.sub, cursor: "pointer", borderRadius: 8, whiteSpace: "nowrap", flexShrink: 0 },
  tabActive: { color: C.ink, fontWeight: 700, background: C.chip },
  badge: { background: C.accent, color: "#fff", borderRadius: 20, fontSize: 11, padding: "1px 6px", marginLeft: 6 },
  cta: { background: C.accent, color: "#fff", border: "none", padding: "10px 16px", borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-block", textAlign: "center", whiteSpace: "nowrap", flexShrink: 0 },
  main: { maxWidth: 1080, margin: "0 auto", padding: "28px 24px 80px", position: "relative", zIndex: 2 },

  hero: { padding: "40px 0 30px", position: "relative" },
  heroGlow: { position: "absolute", top: -40, left: -80, width: 380, height: 280, background: "radial-gradient(circle, rgba(196,84,58,.16), transparent 70%)", filter: "blur(20px)", pointerEvents: "none" },
  h1: { fontFamily: "Fraunces,serif", fontWeight: 900, fontSize: 50, lineHeight: 1.04, margin: 0, letterSpacing: "-.01em", position: "relative" },
  em: { fontStyle: "italic", color: C.accent },
  heroP: { color: C.sub, fontSize: 15, maxWidth: 560, marginTop: 18, lineHeight: 1.65 },
  search: { width: "100%", maxWidth: 520, padding: "14px 16px", fontSize: 15, border: `1px solid ${C.line}`, borderRadius: 13, background: C.paper, marginTop: 24, display: "block", boxShadow: SH.rest },
  cats: { display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" },
  catChip: { background: C.paper, border: `1px solid ${C.line}`, padding: "7px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", color: C.sub },
  catChipActive: { background: C.ink, color: "#fff", borderColor: C.ink },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 22, marginTop: 14 },
  card: { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column" },
  cardThumb: { height: 124, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbSheen: { position: "absolute", top: 0, left: "-60%", width: "50%", height: "100%", background: "linear-gradient(105deg, transparent, rgba(255,255,255,.55), transparent)", transform: "translateX(0)" },
  thumbCat: { position: "absolute", top: 12, left: 12, background: "rgba(251,250,246,.9)", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: C.accentDark, backdropFilter: "blur(4px)" },
  commBadge: { position: "absolute", bottom: 12, right: 12, background: C.gold, color: "#fff", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, boxShadow: "0 4px 12px rgba(184,134,43,.4)" },
  freeBadge: { position: "absolute", bottom: 12, right: 12, background: "#5b8c5a", color: "#fff", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, boxShadow: "0 4px 12px rgba(91,140,90,.4)" },
  thumbGlyph: { fontSize: 42 }, thumbGlyphLg: { fontSize: 64 },
  cardBody: { padding: "16px 18px", flex: 1 },
  builderRow: { fontSize: 12.5, color: C.accentDark, fontWeight: 700, marginBottom: 6 },
  cardTitle: { fontFamily: "Fraunces,serif", fontWeight: 600, fontSize: 19, margin: "0 0 8px" },
  cardDesc: { fontSize: 13.5, color: C.sub, lineHeight: 1.55, margin: "0 0 12px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  tagRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  tag: { background: C.chip, padding: "3px 9px", borderRadius: 6, fontSize: 11.5, color: C.sub },
  cardFoot: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 18px", borderTop: `1px solid ${C.line}` },
  footLeft: { display: "flex", alignItems: "center", gap: 12 },
  reactBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.sub, fontWeight: 600 },
  heartBurst: { position: "absolute", left: "50%", top: "50%", color: C.accent, fontSize: 18, pointerEvents: "none" },
  meta: { fontSize: 13, color: C.sub },
  empty: { color: C.sub, padding: "40px 0", textAlign: "center" },

  detailWrap: { paddingTop: 4 },
  back: { background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 14, padding: "4px 0", marginBottom: 18 },
  detailGrid: { display: "grid", gridTemplateColumns: "1fr 330px", gap: 44 },
  detailHero: { height: 240, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, position: "relative", overflow: "hidden", boxShadow: SH.rest },
  detailTitle: { fontFamily: "Fraunces,serif", fontWeight: 900, fontSize: 36, margin: "8px 0", letterSpacing: "-.01em", wordBreak: "keep-all", overflowWrap: "break-word" },
  detailDesc: { color: C.sub, fontSize: 15.5, lineHeight: 1.75 },
  reactBar: { display: "flex", gap: 18, alignItems: "center", marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.line}` },
  reactBtnLg: { background: C.chip, border: "none", cursor: "pointer", fontSize: 14, color: C.ink, fontWeight: 700, padding: "9px 18px", borderRadius: 22 },
  secTitle: { fontSize: 13, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: ".06em", marginTop: 28, marginBottom: 10 },
  comment: { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 15px", fontSize: 13.5, color: C.sub, marginBottom: 8, lineHeight: 1.5, boxShadow: SH.rest },
  cmtInputRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 14 },

  buyBox: { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 20, padding: 24, height: "fit-content", position: "sticky", top: 92, boxShadow: SH.float },
  demoBtn: { background: C.ink, color: "#fff", border: "none", padding: "14px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  ghBtn: { background: C.paper, color: C.ink, border: `1.5px solid ${C.ink}`, padding: "13px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 },
  osPill: { background: "#5b8c5a", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 12 },
  noGh: { background: C.chip, color: C.sub, fontSize: 12.5, padding: "11px 14px", borderRadius: 12, textAlign: "center", marginTop: 10, lineHeight: 1.5 },
  clickRow: { display: "flex", justifyContent: "space-between", gap: 8, marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${C.line}` },
  clickStat: { fontSize: 12.5, color: C.sub },
  viewBadge: { position: "absolute", bottom: 12, right: 12, background: "#8a8377", color: "#fff", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, boxShadow: "0 4px 12px rgba(107,101,92,.35)" },
  mineStats: { display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: C.sub },
  mineStat: { whiteSpace: "nowrap" },
  freePill: { background: "#5b8c5a", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 12 },
  gateBox: { marginTop: 20, paddingTop: 20, borderTop: `1px dashed ${C.line}` },
  gateLabel: { fontSize: 13, fontWeight: 700, color: C.gold, marginBottom: 12 },
  gatePrice: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", fontSize: 14, borderBottom: `1px solid ${C.line}` },
  ownedBox: { background: "#e3efe4", color: "#2e7d4f", padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 700, textAlign: "center" },
  noComm: { background: C.chip, padding: 14, borderRadius: 12, fontSize: 13.5, color: C.sub, lineHeight: 1.5 },
  note: { fontSize: 12, color: C.sub, marginTop: 10, lineHeight: 1.5 },

  modalBg: { position: "fixed", inset: 0, background: "rgba(31,28,24,.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 },
  modal: { background: C.paper, borderRadius: 24, padding: 34, maxWidth: 480, width: "100%", boxShadow: SH.modal, position: "relative", overflow: "hidden" },
  modalGlow: { position: "absolute", top: -60, right: -40, width: 220, height: 220, background: "radial-gradient(circle, rgba(184,134,43,.22), transparent 70%)", filter: "blur(10px)" },
  lockIcon: { fontSize: 42, textAlign: "center", position: "relative" },
  modalTitle: { fontFamily: "Fraunces,serif", fontWeight: 900, fontSize: 27, textAlign: "center", margin: "10px 0 6px" },
  modalSub: { color: C.sub, fontSize: 14, textAlign: "center", lineHeight: 1.6, marginBottom: 24 },
  planRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 },
  plan: { border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, textAlign: "center", position: "relative", background: C.bg, boxShadow: SH.rest },
  planHot: { borderColor: C.accent, borderWidth: 2 },
  planBadge: { position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: C.accent, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 12px", borderRadius: 20 },
  planName: { fontSize: 13, color: C.sub, fontWeight: 700 },
  planPrice: { fontFamily: "Fraunces,serif", fontWeight: 900, fontSize: 25, margin: "8px 0" },
  perMo: { fontSize: 13, fontWeight: 400, color: C.sub },
  planDesc: { fontSize: 12, color: C.sub, lineHeight: 1.4 },
  modalClose: { display: "block", margin: "20px auto 0", background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 13 },

  formWrap: { maxWidth: 640, margin: "0 auto" },
  authWrap: { maxWidth: 440, margin: "0 auto" },
  authTabs: { display: "flex", gap: 4, background: C.chip, borderRadius: 12, padding: 4, marginBottom: 22 },
  authTab: { flex: 1, padding: "10px 0", border: "none", background: "none", borderRadius: 9, fontSize: 14, fontWeight: 700, color: C.sub, cursor: "pointer", transition: "all .18s" },
  authTabOn: { background: C.paper, color: C.ink, boxShadow: SH.rest },
  formH1: { fontFamily: "Fraunces,serif", fontWeight: 900, fontSize: 36, margin: "8px 0" },
  formSub: { color: C.sub, fontSize: 14, marginBottom: 26, lineHeight: 1.6 },
  field: { display: "block", marginBottom: 18 },
  fieldLabel: { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 },
  in: { width: "100%", padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 11, fontSize: 14, background: C.paper },
  pwWrap: { position: "relative" },
  pwToggle: { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.accentDark, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },
  pwMeterRow: { display: "flex", alignItems: "center", gap: 5, marginTop: 9 },
  pwMeterSeg: { height: 5, flex: 1, borderRadius: 3, transition: "background .2s" },
  pwMeterLabel: { fontSize: 12, fontWeight: 700, marginLeft: 4, minWidth: 28 },
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  errText: { color: C.accent, fontSize: 12, marginTop: 4, display: "block" },
  authError: { background: "#fbeae6", border: "1px solid #f0c4ba", color: C.accentDark, borderRadius: 11, padding: "11px 14px", fontSize: 13, marginBottom: 12, lineHeight: 1.5 },
  authInfo: { background: "#e3efe4", border: "1px solid #bfe0c6", color: "#2e7d4f", borderRadius: 11, padding: "11px 14px", fontSize: 13, marginBottom: 12, lineHeight: 1.5 },
  authSwitch: { marginTop: 16, fontSize: 13.5, color: C.sub, textAlign: "center", lineHeight: 1.6 },
  linkBtn: { background: "none", border: "none", color: C.accentDark, fontWeight: 700, cursor: "pointer", fontSize: 13.5, padding: 0 },
  code: { background: C.chip, padding: "1px 6px", borderRadius: 5, fontSize: 12.5, fontFamily: "monospace" },
  snsRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8 },
  snsDel: { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, width: 42, height: 42, fontSize: 14, color: C.sub, cursor: "pointer", flexShrink: 0 },
  snsAdd: { background: C.paper, border: `1px dashed ${C.accent}`, borderRadius: 10, padding: "9px 14px", fontSize: 13, color: C.accentDark, fontWeight: 700, cursor: "pointer", marginTop: 2 },
  commToggleBox: { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, marginBottom: 18, boxShadow: SH.rest },
  commToggle: { display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5, cursor: "pointer" },

  msgCard: { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: SH.rest },
  msgHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  msgText: { color: C.sub, fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" },
  statusChip: { background: "#e3efe4", color: "#2e7d4f", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  statusChipPend: { background: "#e9eef0", color: "#5a6b72", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  commChip: { background: "#f7ecd4", color: C.gold, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  unlockChip: { background: "#fbeee5", color: C.accentDark, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  lineItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.line}` },

  toast: { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: C.ink, color: "#fff", padding: "14px 24px", borderRadius: 13, fontSize: 14, boxShadow: SH.modal, zIndex: 50, maxWidth: "90%" },
  footer: { textAlign: "center", padding: "24px", fontSize: 12.5, color: C.sub, borderTop: `1px solid ${C.line}`, position: "relative", zIndex: 2 },
  footerSep: { margin: "0 8px", color: C.line },
  footerAdmin: { background: "none", border: "none", color: C.sub, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", padding: 0 },

  adminLoginWrap: { maxWidth: 420, margin: "40px auto 0", textAlign: "center" },
  adminLockBig: { fontSize: 48, marginBottom: 8 },
  adminHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  catAdminRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  catAdminChip: { display: "inline-flex", alignItems: "center", gap: 6, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 20, padding: "6px 8px 6px 14px", fontSize: 13, fontWeight: 600, boxShadow: SH.rest },
  catDel: { background: "#fbeae6", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 11, color: C.accentDark, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  catAddRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 4 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 8 },
  statCard: { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 18px", boxShadow: SH.rest },
  statCardWide: { gridColumn: "1 / -1", background: "linear-gradient(135deg, #fbf3e4, #f7ecd4)", borderColor: "#eddcb4" },
  statTop: { display: "flex", alignItems: "center", gap: 7, marginBottom: 8 },
  statIcon: { fontSize: 16 },
  statLabel: { fontSize: 12.5, color: C.sub, fontWeight: 700 },
  statValue: { fontFamily: "Fraunces,serif", fontWeight: 900, fontSize: 28, color: C.ink, lineHeight: 1.1 },
  statHint: { fontSize: 11.5, color: C.sub, marginTop: 4 },
  meTag: { background: C.chip, color: C.sub, borderRadius: 20, fontSize: 10.5, fontWeight: 700, padding: "1px 7px", marginLeft: 6 },
  selfNote: { fontSize: 12, color: C.sub, flexShrink: 0, padding: "8px 4px" },
  adminRow: { display: "flex", alignItems: "center", gap: 12, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: SH.rest },
  adminRowTitle: { fontSize: 14, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  adminRowMeta: { fontSize: 12, color: C.sub, marginTop: 3 },
  delBtn: { background: "#fbeae6", border: `1px solid #f0c4ba`, borderRadius: 9, padding: "8px 14px", fontSize: 13, color: C.accentDark, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  confirmRow: { display: "flex", gap: 6, flexShrink: 0 },
  delConfirm: { background: C.accent, color: "#fff", border: "none", borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  delCancel: { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 12px", fontSize: 13, color: C.sub, cursor: "pointer" },
};
