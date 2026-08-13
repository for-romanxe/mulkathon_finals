"use client";
// E1(#48): 질문 입력 → 답변 + 호출된 함수 배지. 어떤 계산을 거쳤는지 그대로 보여준다.
import { useState } from "react";

type Trace = { tool: string; input: unknown; output: unknown };
type Msg = { role: "user" | "assistant"; text: string; trace?: Trace[]; isError?: boolean };

const TOOL_LABEL: Record<string, string> = {
  b3_od_lookup: "B3 물량 조회",
  c1_env_benefit: "C1 환경 편익",
  c2_social_benefit: "C2 사회 편익",
  b4_directional: "B4 편방향 판정",
};

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => !m.isError).map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) throw new Error(`서버 응답이 JSON이 아님 (HTTP ${res.status}) — /api/chat 배포 확인`);
      const data = await res.json();
      if (data.error) {
        setMsgs([...next, { role: "assistant", text: data.error, isError: true, trace: data.trace }]);
      } else {
        setMsgs([...next, { role: "assistant", text: data.text, trace: data.trace }]);
      }
    } catch (e) {
      setMsgs([...next, { role: "assistant", text: e instanceof Error ? e.message : "요청 실패", isError: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col p-6">
      <header className="border-b border-neutral-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">철도 전환 편익 오케스트레이터</h1>
        <p className="mt-1 text-sm text-neutral-500">숫자는 코드가, 해석은 AI가 — 호출된 함수가 답변 아래에 표시됩니다.</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {msgs.length === 0 && (
          <p className="text-sm text-neutral-400">
            예: &ldquo;구미에서 부산진으로 컨테이너 주 3회 보내는데, 철도로 바꾸면 뭐가 좋은가요?&rdquo;
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm text-white"
                  : m.isError
                    ? "max-w-[85%] rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
                    : "max-w-[85%] rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm text-neutral-900"
              }
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.trace && m.trace.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-neutral-200 pt-2">
                  {m.trace.map((t, j) => (
                    <span
                      key={j}
                      title={JSON.stringify(t.input)}
                      className="rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-600"
                    >
                      ⚙ {TOOL_LABEL[t.tool] ?? t.tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-neutral-400">함수 호출 중…</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 border-t border-neutral-200 pt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="화주 질문을 입력하세요"
          className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          질문
        </button>
      </form>
    </main>
  );
}
