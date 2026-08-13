"use client";
// E1(#48) 대화 · E2(#50) 근거 카드·되먹임 · E3(#80) 흐름 지도.
// 화면 골격: 왼쪽 내비 / 지표 카드 / 대화 + 우측 패널(지도·함수 로그·데이터 출처).
import { useEffect, useMemo, useRef, useState } from "react";
import FlowMap, { type Flow } from "./FlowMap";
import { summarizeBackhaul } from "@/lib/calc/backhaul";
import type { OdRow } from "@/lib/calc/od";

type Trace = { tool: string; input: unknown; output: unknown };
type Msg = { role: "user" | "assistant"; text: string; trace?: Trace[]; isError?: boolean };

const TOOL_LABEL: Record<string, string> = {
  b3_od_lookup: "실제 운송 실적 조회",
  c1_env_benefit: "탄소·대기오염 절감 계산",
  c2_social_benefit: "교통사고·혼잡 절감 계산",
  b4_directional: "돌아오는 화물 확인",
  b5_backhaul: "B5 복화 가능성",
  b1_dwell_breakdown: "B1 체류시간",
  b2_x_factor: "B2 X-factor",
};

const EXAMPLES = [
  "오봉에서 북철송장으로 컨테이너 보내는데, 철도로 바꾸면 뭐가 좋은가요? 돌아오는 화물도 있나요?",
  "신광양항에서 군산항 구간은 복화가 가능한가요?",
  "구미에서 부산으로 보내는 물량은요?",
];

const SOURCES: [string, string][] = [
  ["화물열차 시간표", "공공데이터포털 15042241 · 330편 8,972행"],
  ["화물취급역 명부", "공공데이터포털 15042207 · 2019년 기준"],
  ["선구별 운행횟수", "공공데이터포털 15068417 · 15068420"],
  ["수송통계 O-D", "국가철도공단 API · 10,245건 (2025)"],
  ["편익 원단위", "국토부 「교통시설 투자평가지침」 고시 2022-500호"],
];

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
      title: "물량 · 거리",
      rows: [
        ["물량 (2025 하반기)", `${b3.ton?.toLocaleString()}톤`],
        ["톤킬로", `${b3.tonkm?.toLocaleString()}`],
        ["평균 거리", `${b3.km}km`],
      ],
      source: "2025 수송통계 O-D — 코드 계산",
    });
  const b4 = last("b4_directional")?.output as
    | { found?: boolean; forward_ton?: number; reverse_ton?: number; reverse_share_pct?: number; one_way?: boolean }
    | undefined;
  if (b4?.found)
    cards.push({
      title: b4.one_way ? "돌아올 때 실을 화물 — 없음" : "돌아올 때 실을 화물",
      rows: [
        ["보내는 방향", `${Math.round(b4.forward_ton ?? 0).toLocaleString()}톤`],
        ["돌아오는 방향", `${Math.round(b4.reverse_ton ?? 0).toLocaleString()}톤`],
        ["왕복 활용도", `${b4.reverse_share_pct}%`],
      ],
      source: "2025년 실제 운송실적에서 집계",
    });
  // 편익 — 원단위가 들어오면 금액이, 아직이면 무엇이 없는지가 나온다
  const c1 = last("c1_env_benefit")?.output as
    | { stub?: boolean; need?: string; formula?: string; avoided_co2_ton?: number; avoided_air_pollution_cost_won?: number }
    | undefined;
  const c2 = last("c2_social_benefit")?.output as
    | { stub?: boolean; need?: string; avoided_accident_cost_won?: number; avoided_congestion_cost_won?: number }
    | undefined;
  if (c1 && !c1.stub)
    cards.push({
      title: "탄소·대기오염 절감",
      rows: [
        ["줄어드는 탄소", `${c1.avoided_co2_ton?.toLocaleString()}톤`],
        ["대기오염 절감액", `${c1.avoided_air_pollution_cost_won?.toLocaleString()}원`],
      ],
      source: "국토교통부 교통시설 투자평가지침 기준",
    });
  if (c2 && !c2.stub)
    cards.push({
      title: "교통사고·도로혼잡 절감",
      rows: [
        ["사고 감소 효과", `${c2.avoided_accident_cost_won?.toLocaleString()}원`],
        ["혼잡 감소 효과", `${c2.avoided_congestion_cost_won?.toLocaleString()}원`],
      ],
      source: "국토교통부 교통시설 투자평가지침 기준",
    });
  const pending = [c1, c2].find((x) => x?.stub);
  if (pending)
    cards.push({
      title: "탄소·사고·혼잡 절감액",
      rows: [["산출 상태", "국토교통부 공식 기준값을 적용한 뒤 금액으로 알려드립니다"]],
      source: "근거 없는 금액은 제시하지 않습니다",
      muted: true,
    });
  return cards;
}

function ClickableText({ text, names, onPick }: { text: string; names: string[]; onPick: (n: string) => void }) {
  if (!names.length) return <p className="whitespace-pre-wrap">{text}</p>;
  const re = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <p className="whitespace-pre-wrap">
      {text.split(re).map((part, i) =>
        names.includes(part) ? (
          <button
            key={i}
            onClick={() => onPick(part)}
            className="rounded bg-[#dbe2ef] px-1 font-semibold text-[#112d4e] underline decoration-[#3f72af] decoration-dotted hover:bg-[#c9d5e8]"
          >
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

function activeRoute(msgs: Msg[]): { from: string; to: string } | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    for (const t of msgs[i].trace ?? []) {
      const inp = t.input as { from?: string; to?: string };
      if (inp?.from && inp?.to) return { from: inp.from, to: inp.to };
    }
  }
  return null;
}

type Summary = {
  source: { trains: number; od_records: number };
  x_factor: number;
  dwell_share_pct: number;
  dwell_min_by_reason: Record<string, number>;
  od: { total_ton: number; dominant_dir_ton_pct: number; pairs_undirected: number; bidirectional_pair_pct: number };
};

type View = "map" | "log" | "source";

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [backhaul, setBackhaul] = useState<{ pairs: number; oneWay: number; backhaulPct: number } | null>(null);
  const [view, setView] = useState<View>("map");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/data/od_stats.json")
      .then((r) => r.json())
      // 지도는 굵은 선만 그리지만, 편방향·복화 지표는 392쌍 전체로 집계한다.
      // B5 도구와 같은 함수를 쓰므로 화면과 답변이 같은 수를 말한다.
      .then((d: OdRow[]) => {
        setFlows((d as Flow[]).filter((f) => f.ton > 20000));
        const s = summarizeBackhaul(d);
        setBackhaul({ pairs: d.length, oneWay: s.one_way_pairs, backhaulPct: s.matched_ton_pct });
      })
      .catch(() => {});
    fetch("/data/summary.json")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  const active = useMemo(() => activeRoute(msgs), [msgs]);
  const allTrace = useMemo(() => msgs.flatMap((m) => m.trace ?? []), [msgs]);

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setView("map");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => !m.isError).map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json"))
        throw new Error(`서버 응답이 JSON이 아님 (HTTP ${res.status}) — /api/chat 배포 확인`);
      const data = await res.json();
      setMsgs([
        ...next,
        data.error
          ? { role: "assistant", text: data.error, isError: true, trace: data.trace }
          : { role: "assistant", text: data.text, trace: data.trace },
      ]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", text: e instanceof Error ? e.message : "요청 실패", isError: true }]);
    } finally {
      setBusy(false);
    }
  }

  const kpis: { label: string; value: string; note: string; warn?: boolean }[] = summary
    ? [
        {
          label: "돌아올 때 빈 차로 오는 구간",
          // 값은 쌍 기준이어야 라벨과 맞는다. dominant_dir_ton_pct(84.7%)는 톤 기준이라
          // "구간의 비율"이라는 설명과 다른 것을 가리키고, main의 경고 배너(63.5%)와도 갈린다.
          value: backhaul ? `${((backhaul.oneWay / backhaul.pairs) * 100).toFixed(1)}%` : "—",
          note: backhaul
            ? `${backhaul.pairs}개 구간 중 ${backhaul.oneWay}개 · 돌아올 때 실을 화물은 ${backhaul.backhaulPct}%뿐`
            : "집계 중",
          warn: true,
        },
        {
          label: "철도로 옮긴 화물",
          value: `${(summary.od.total_ton / 10000).toFixed(0)}만 톤`,
          note: `2025년 8~12월 · 전국 ${summary.od.pairs_undirected}개 구간`,
        },
        {
          label: "실제 걸리는 시간",
          value: `${summary.x_factor}배`,
          note: `쉬지 않고 달릴 때의 ${summary.x_factor}배 — 중간 정차 때문`,
        },
        {
          label: "역에 서 있는 시간",
          value: `${Math.round(summary.dwell_min_by_reason["화물취급"] ?? 0).toLocaleString()}분`,
          note: "화물 싣고 내리느라 멈춘 시간이 가장 길다",
        },
      ]
    : [];

  const NAV: [View, string, string][] = [
    ["map", "전국 물동량", "M3 12h18M12 3v18"],
    ["log", "계산 근거", "M4 6h16M4 12h10M4 18h13"],
    ["source", "데이터 출처", "M4 5h16v14H4z"],
  ];

  return (
    <div className="flex h-screen bg-[#f9f7f7] text-[#112d4e]">
      {/* 사이드바 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[#dbe2ef] bg-white px-4 py-5 lg:flex">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3f72af] text-sm font-bold text-white">철</div>
          <span className="text-[15px] font-semibold tracking-tight">전환 편익 콘솔</span>
        </div>

        <nav className="mt-7 space-y-1">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#3f72af]/60">화면</p>
          {NAV.map(([v, label, d]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                view === v ? "bg-[#dbe2ef] font-semibold text-[#112d4e]" : "text-[#112d4e]/65 hover:bg-[#f9f7f7]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d={d} strokeLinecap="round" />
              </svg>
              {label}
              {v === "log" && allTrace.length > 0 && (
                <span className="ml-auto rounded-full bg-[#3f72af] px-1.5 text-[10px] font-semibold text-white">
                  {allTrace.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-[#dbe2ef] bg-[#f9f7f7] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3f72af]">계산 원칙</p>
              <span className="h-1.5 w-1.5 rounded-full bg-[#3f72af]" />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#112d4e]/70">
              숫자는 <strong className="text-[#112d4e]">코드가</strong> 계산하고, AI는 어떤 함수를 부를지와 해석만 맡습니다.
            </p>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-[#dbe2ef] p-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#112d4e] text-xs font-semibold text-white">영업</div>
            <div className="leading-tight">
              <p className="text-xs font-semibold">코레일 물류 영업</p>
              <p className="text-[10px] text-[#112d4e]/50">화주 미팅용 콘솔</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 본문 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[#dbe2ef] bg-white px-6 py-4">
          <p className="text-xs text-[#112d4e]/45">코레일 물류 / 전환 편익 상담</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">전환 편익 상담.</h1>
              <p className="mt-1 text-sm text-[#112d4e]/75">
                화물을 트럭에서 철도로 옮기면 무엇이 얼마나 나아지는지, <strong className="font-semibold text-[#112d4e]">실제 운송 실적으로</strong> 계산해 드립니다.
              </p>
              <p className="mt-0.5 text-xs text-[#112d4e]/45">
                {summary
                  ? `화물열차 ${summary.source.trains}편 · 2025년 하반기 운송실적 ${summary.source.od_records.toLocaleString()}건 기준`
                  : "데이터 불러오는 중…"}
              </p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-lg border border-[#dbe2ef] px-3 py-1.5 text-xs text-[#112d4e]/60">2025 하반기(8~12월) 139일 실적</span>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* 경고 배너 — 우리 핵심 발견 */}
          {summary && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#f0c088] bg-[#fdf6ec] px-4 py-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#e08b2c]" />
              <p className="text-sm">
                <strong>돌아오는 화물이 없습니다.</strong>{" "}
                <span className="text-[#112d4e]/70">
                  물량의 {summary.od.dominant_dir_ton_pct}%가 각 구간의 우세 방향으로 쏠려 있고, 양방향으로 물량이
                  오가는 구간은 {summary.od.bidirectional_pair_pct}%뿐입니다. 편익 계산에는 이 회송 부담이 반영돼야
                  합니다.
                </span>
              </p>
            </div>
          )}

          {/* 지표 카드 */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-[#dbe2ef] bg-white px-4 py-3">
                <p className="text-xs text-[#112d4e]/55">{k.label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${k.warn ? "text-[#c2410c]" : "text-[#112d4e]"}`}>{k.value}</p>
                <p className="mt-1 text-[11px] text-[#112d4e]/45">{k.note}</p>
              </div>
            ))}
          </div>

          {/* 대화 + 우측 패널 */}
          <div className="mt-4 grid min-h-[460px] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <section className="flex min-h-0 flex-col rounded-xl border border-[#dbe2ef] bg-white">
              <div className="flex items-baseline justify-between border-b border-[#dbe2ef] px-4 py-3">
                <h2 className="text-sm font-semibold">화주 상담</h2>
                <p className="text-[11px] text-[#112d4e]/45">모든 숫자는 실제 운송 실적에서 계산합니다</p>
              </div>

              <div ref={scrollRef} className="max-h-[46vh] min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
                {msgs.length === 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-[#112d4e]/45">평소 쓰시는 말로 물어보세요. 아래를 눌러도 됩니다.</p>
                    {EXAMPLES.map((e) => (
                      <button
                        key={e}
                        onClick={() => send(e)}
                        className="block w-full rounded-lg border border-[#dbe2ef] bg-[#f9f7f7] px-3.5 py-2.5 text-left text-sm hover:border-[#3f72af] hover:bg-white"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
                {msgs.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[88%] rounded-2xl bg-[#112d4e] px-4 py-2.5 text-sm text-white"
                          : m.isError
                            ? "max-w-[95%] rounded-2xl border border-[#f0c088] bg-[#fdf6ec] px-4 py-2.5 text-sm"
                            : "max-w-[95%] rounded-2xl border border-[#dbe2ef] bg-[#f9f7f7] px-4 py-2.5 text-sm"
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
                            const from = n === inp.to ? inp.to : n;
                            const to = n === inp.to ? inp.from : (inp.to ?? st.find((s) => s !== n));
                            if (from && to) send(`${from}에서 ${to} 구간의 물량·방향·편익을 다시 계산해줘`);
                          }}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap">{m.text}</p>
                      )}

                      {m.trace && m.trace.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[#dbe2ef] pt-2.5">
                          {m.trace.map((t, j) => (
                            <span
                              key={j}
                              title={JSON.stringify(t.input)}
                              className="rounded-full bg-[#dbe2ef] px-2 py-0.5 text-[11px] font-medium text-[#112d4e]"
                            >
                              ⚙ {TOOL_LABEL[t.tool] ?? t.tool}
                            </span>
                          ))}
                        </div>
                      )}

                      {m.trace && cardsFromTrace(m.trace).length > 0 && (
                        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                          {cardsFromTrace(m.trace).map((c, j) => (
                            <div
                              key={j}
                              className={`rounded-lg border bg-white p-3 ${c.muted ? "border-dashed border-[#dbe2ef] sm:col-span-2" : "border-[#dbe2ef]"}`}
                            >
                              <p className="text-[11px] font-semibold text-[#3f72af]">{c.title}</p>
                              <dl className="mt-1.5 space-y-1">
                                {c.rows.map(([k, v], r) => (
                                  <div key={r} className="flex justify-between gap-3 text-xs">
                                    <dt className="shrink-0 whitespace-nowrap text-[#112d4e]/50">{k}</dt>
                                    <dd className="text-right font-semibold tabular-nums break-words">{v}</dd>
                                  </div>
                                ))}
                              </dl>
                              <p className="mt-2 border-t border-[#dbe2ef] pt-1.5 text-[10px] text-[#112d4e]/40">{c.source}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {busy && (
                  <p className="flex items-center gap-2 text-sm text-[#3f72af]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3f72af]" />
                    함수 호출 중…
                  </p>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex gap-2 border-t border-[#dbe2ef] p-3"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="화주 질문을 입력하세요"
                  className="flex-1 rounded-lg border border-[#dbe2ef] bg-[#f9f7f7] px-3.5 py-2.5 text-sm outline-none placeholder:text-[#112d4e]/35 focus:border-[#3f72af] focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="rounded-lg bg-[#3f72af] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#112d4e] disabled:opacity-35"
                >
                  질문
                </button>
              </form>
            </section>

            {/* 우측 패널 */}
            <section className="flex min-h-0 flex-col rounded-xl border border-[#dbe2ef] bg-white">
              <div className="flex items-baseline justify-between border-b border-[#dbe2ef] px-4 py-3">
                <h2 className="text-sm font-semibold">
                  {view === "map" ? "전국 화물 물동량" : view === "log" ? "이 답은 어떻게 나왔나" : "무엇을 근거로 답하나"}
                </h2>
                <p className="text-[11px] text-[#112d4e]/45">
                  {view === "map"
                    ? active
                      ? `${active.from} → ${active.to} 강조 중`
                      : "선을 클릭하면 그 구간을 질문합니다"
                    : view === "log"
                      ? `계산 ${allTrace.length}단계`
                      : "원본은 재배포하지 않습니다"}
                </p>
              </div>

              {view === "map" && (
                <>
                  <div className="min-h-0 max-h-[52vh] flex-1 p-2">
                    {flows.length > 0 ? (
                      <FlowMap
                        flows={flows}
                        active={active}
                        onPick={(f, t) => send(`${f}에서 ${t} 구간, 철도 전환하면 편익과 복화 가능성이 어떻게 되나요?`)}
                      />
                    ) : (
                      <p className="pt-10 text-center text-sm text-[#112d4e]/40">흐름 데이터를 불러오는 중…</p>
                    )}
                  </div>
                  <p className="border-t border-[#dbe2ef] px-4 py-2.5 text-[10px] leading-relaxed text-[#112d4e]/40">
                    2025 하반기(139일) O-D 중 2만 톤 이상 구간. 선 굵기 = 물량, 선 색 = 역방향 물량 비중. 역 위치는 지역 기준{" "}
                    <strong>근사 좌표</strong>이며 측량값이 아닙니다.
                  </p>
                </>
              )}

              {view === "log" && (
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {allTrace.length === 0 ? (
                    <p className="pt-8 text-center text-sm text-[#112d4e]/40">아직 호출된 함수가 없습니다.</p>
                  ) : (
                    <ol className="space-y-2.5">
                      {allTrace.map((t, i) => {
                        const out = t.output as { found?: boolean; stub?: boolean; note?: string };
                        const status = out?.stub ? ["원단위 대기", "#3f72af"] : out?.found === false ? ["데이터 없음", "#c2410c"] : ["계산 완료", "#15803d"];
                        return (
                          <li key={i} className="rounded-lg border border-[#dbe2ef] bg-[#f9f7f7] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold">
                                <span className="text-[#112d4e]/40">{i + 1}.</span> {TOOL_LABEL[t.tool] ?? t.tool}
                              </p>
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: status[1], background: "#fff" }}>
                                {status[0]}
                              </span>
                            </div>
                            <p className="mt-1.5 font-mono text-[10px] leading-relaxed break-all text-[#112d4e]/55">
                              in {JSON.stringify(t.input)}
                            </p>
                            <p className="mt-1 font-mono text-[10px] leading-relaxed break-all text-[#112d4e]/55">
                              out {JSON.stringify(t.output)}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              )}

              {view === "source" && (
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#dbe2ef] text-[10px] uppercase tracking-wider text-[#112d4e]/45">
                        <th className="pb-2 font-medium">데이터</th>
                        <th className="pb-2 font-medium">출처</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SOURCES.map(([name, src]) => (
                        <tr key={name} className="border-b border-[#dbe2ef]/60 last:border-0">
                          <td className="py-2.5 pr-3 text-xs font-semibold whitespace-nowrap">{name}</td>
                          <td className="py-2.5 text-xs text-[#112d4e]/60">{src}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-4 rounded-lg border border-[#dbe2ef] bg-[#f9f7f7] p-3 text-[11px] leading-relaxed text-[#112d4e]/65">
                    시간표와 O-D는 <strong className="text-[#112d4e]">역 단위로 강제 조인하지 않습니다</strong> — 조인율이 79%라
                    부산신항·신광양항 같은 역이 누락되기 때문입니다. 두 데이터는 따로 쓰고, 답할 수 없는 질문은 그대로 답할 수
                    없다고 말합니다.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
