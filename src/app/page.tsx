"use client";
// E1(#48): 질문 입력 → 답변 + 호출된 함수 배지. 어떤 계산을 거쳤는지 그대로 보여준다.
// E2(#50): 답변 아래 근거 카드(물량·방향·편익) + 서술 속 구간 이름 클릭 → 재계산.
import { useState } from "react";

type Trace = { tool: string; input: unknown; output: unknown };
type Msg = { role: "user" | "assistant"; text: string; trace?: Trace[]; isError?: boolean };

const TOOL_LABEL: Record<string, string> = {
  b3_od_lookup: "B3 물량 조회",
  c1_env_benefit: "C1 환경 편익",
  c2_social_benefit: "C2 사회 편익",
  b4_directional: "B4 편방향 판정",
};

type Card = { title: string; rows: [string, string][]; source: string; muted?: boolean };

// trace의 구조화 출력 → 카드. 숫자는 전부 도구 반환값 그대로 — 여기서 재계산하지 않는다.
function cardsFromTrace(trace: Trace[]): Card[] {
  const cards: Card[] = [];
  const last = (name: string) => [...trace].reverse().find((t) => t.tool === name);
  const b3 = last("b3_od_lookup")?.output as
    | { found?: boolean; ton?: number; tonkm?: number; km?: number }
    | undefined;
  if (b3?.found)
    cards.push({
      title: "물량·거리",
      rows: [["연간 물량", `${b3.ton?.toLocaleString()}톤`], ["톤킬로", `${b3.tonkm?.toLocaleString()}`], ["평균 거리", `${b3.km}km`]],
      source: "2025 수송통계 O-D — 코드 계산",
    });
  const b4 = last("b4_directional")?.output as
    | { found?: boolean; forward_ton?: number; reverse_ton?: number; reverse_share_pct?: number; one_way?: boolean }
    | undefined;
  if (b4?.found)
    cards.push({
      title: b4.one_way ? "방향 — 편방향 구간" : "방향",
      rows: [["정방향", `${b4.forward_ton?.toLocaleString()}톤`], ["역방향", `${b4.reverse_ton?.toLocaleString()}톤`], ["역방향 비중", `${b4.reverse_share_pct}%`]],
      source: "2025 수송통계 O-D — 코드 계산",
    });
  const stub = trace.find((t) => (t.output as { stub?: boolean })?.stub);
  if (stub)
    cards.push({
      title: "편익(원)",
      rows: [["상태", "원단위 확정 전 — 금액 미산출"]],
      source: (stub.output as { need?: string }).need ?? "#35·#37 대기",
      muted: true,
    });
  return cards;
}

// 서술 속 구간 이름(trace 입력에 등장한 역명)을 클릭 가능하게 감싼다.
function ClickableText({ text, names, onPick }: { text: string; names: string[]; onPick: (n: string) => void }) {
  if (!names.length) return <p className="whitespace-pre-wrap">{text}</p>;
  const re = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <p className="whitespace-pre-wrap">
      {text.split(re).map((part, i) =>
        names.includes(part) ? (
          <button key={i} onClick={() => onPick(part)} className="rounded bg-neutral-200 px-1 font-medium underline decoration-dotted hover:bg-neutral-300">
            {part}
          </button>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function stationNames(trace?: Trace[]): string[] {
  const set = new Set<string>();
  for (const t of trace ?? []) {
    const inp = t.input as { from?: string; to?: string };
    if (inp?.from) set.add(inp.from);
    if (inp?.to) set.add(inp.to);
  }
  return [...set];
}

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(question?: string) {
    const q = (question ?? input).trim();
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
              {m.role === "assistant" && !m.isError ? (
                <ClickableText
                  text={m.text}
                  names={stationNames(m.trace)}
                  onPick={(n) => {
                    const st = stationNames(m.trace);
                    const inp = (m.trace?.find((t) => t.tool === "b3_od_lookup" || t.tool === "b4_directional")
                      ?.input ?? {}) as { from?: string; to?: string };
                    // 클릭한 역이 도착역이면 방향을 뒤집고, 아니면 출발역으로 바꿔 재계산
                    const from = n === inp.to ? inp.to : n;
                    const to = n === inp.to ? inp.from : (inp.to ?? st.find((s) => s !== n));
                    if (from && to) send(`${from}에서 ${to} 구간의 물량·방향·편익을 다시 계산해줘`);
                  }}
                />
              ) : (
                <p className="whitespace-pre-wrap">{m.text}</p>
              )}
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
              {m.trace && cardsFromTrace(m.trace).length > 0 && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {cardsFromTrace(m.trace).map((c, j) => (
                    <div key={j} className={`rounded-xl border p-3 ${c.muted ? "border-dashed border-neutral-300 bg-white" : "border-neutral-200 bg-white"}`}>
                      <p className="text-xs font-semibold text-neutral-700">{c.title}</p>
                      <dl className="mt-1.5 space-y-0.5">
                        {c.rows.map(([k, v], r) => (
                          <div key={r} className="flex justify-between gap-3 text-xs">
                            <dt className="text-neutral-500">{k}</dt>
                            <dd className="font-medium tabular-nums text-neutral-900">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-1.5 text-[10px] text-neutral-400">{c.source}</p>
                    </div>
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
