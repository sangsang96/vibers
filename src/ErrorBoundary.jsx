import React from "react";

// ============================================================
//  ErrorBoundary — 앱이 예기치 못하게 멈춰도 "흰 화면" 대신
//  친절한 안내 화면을 보여주는 안전망.
//  · 어떤 화면에서 오류가 나도 앱 전체가 죽지 않게 감싸줌.
//  · 오류 내용을 화면에 보여줘서, 그대로 복사해 개발자에게 주면 바로 고칠 수 있음.
//  사용: main.jsx 에서 <ErrorBoundary><App/></ErrorBoundary> 로 감쌈.
// ============================================================
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // 콘솔에도 남겨서 개발자 도구에서 확인 가능
    console.error("[바이버스] 화면 오류:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const detail =
      String(this.state.error?.stack || this.state.error?.message || this.state.error) +
      (this.state.info?.componentStack || "");

    return (
      <div style={S.wrap}>
        <div style={S.card}>
          <div style={S.icon}>🛠️</div>
          <h1 style={S.h1}>잠깐, 화면에 문제가 생겼어요</h1>
          <p style={S.p}>
            앱이 완전히 멈추진 않았어요. 아래 버튼으로 대부분 해결되고,
            그래도 안 되면 <b>회색 상자 내용을 복사해서 개발자에게 그대로</b> 주세요. 바로 고칠 수 있어요.
          </p>
          <div style={S.btnRow}>
            <button style={S.primary} onClick={() => window.location.reload()}>새로고침</button>
            <button style={S.ghost} onClick={() => { window.location.href = "/"; }}>처음 화면으로</button>
            <button style={S.ghost} onClick={() => copy(detail)}>오류 내용 복사</button>
          </div>
          <details style={S.details}>
            <summary style={S.summary}>오류 상세 보기 (개발자용)</summary>
            <pre style={S.pre}>{detail}</pre>
          </details>
        </div>
      </div>
    );
  }
}

function copy(text) {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    /* 클립보드 접근 불가 시 조용히 무시 */
  }
}

const INK = "#1C1917";
const SUB = "#57534E";
const LINE = "#E7E2DB";
const S = {
  wrap: {
    minHeight: "100vh", background: "#FDFCFA", color: INK,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    fontFamily: "'Pretendard', -apple-system, 'Apple SD Gothic Neo', system-ui, sans-serif",
  },
  card: {
    background: "#FDFCFA", border: `1px solid ${LINE}`, borderRadius: 16,
    padding: 32, maxWidth: 520, width: "100%",
    boxShadow: "0 12px 40px rgba(28,25,23,.14)",
  },
  icon: { fontSize: 40, marginBottom: 8 },
  h1: { fontSize: 24, fontWeight: 600, letterSpacing: "-.02em", margin: "6px 0 10px" },
  p: { color: SUB, fontSize: 14.5, lineHeight: 1.7, margin: "0 0 20px" },
  btnRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 },
  primary: {
    background: "#56728A", color: "#fff", border: "none", borderRadius: 10,
    padding: "10px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer",
  },
  ghost: {
    background: "#FDFCFA", color: INK, border: `1px solid #D9D2C7`, borderRadius: 10,
    padding: "10px 16px", fontSize: 14, cursor: "pointer",
  },
  details: { borderTop: `1px solid ${LINE}`, paddingTop: 14 },
  summary: { cursor: "pointer", fontSize: 13, color: SUB, fontWeight: 500 },
  pre: {
    marginTop: 10, background: "#F7F4EF", border: `1px solid ${LINE}`, borderRadius: 8, padding: 14,
    fontSize: 11.5, lineHeight: 1.5, color: INK, overflowX: "auto",
    whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 240,
  },
};
