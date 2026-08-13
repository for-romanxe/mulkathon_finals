"use client";
// E1(#48) 대화 · E2(#50) 근거 카드·되먹임 · E3(#80) 흐름 지도.
// 화면 골격: 상담 기록 / 가운데 대화 / 우측 근거 패널(필요할 때만 밀려 나온다).
// 기본 화면은 대화만 둔다 — 전국 집계 수치는 발표자료와 우측 패널에서 다룬다.
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
  b5_backhaul: "돌아올 때 실을 화물 찾기",
  b1_dwell_breakdown: "역에 서 있는 시간 분석",
  b2_x_factor: "실제 걸리는 시간 계산",
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
  ["구간별 운송 실적", "국가철도공단 API · 10,245건 · 2025 하반기 139일"],
  ["편익 기준값", "국토부 교통시설 투자평가지침 제8차(고시 2026-204호) · 전환교통지원사업 공모자료(2024)"],
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
        ["운송량 × 거리", `${b3.tonkm?.toLocaleString()}`],
        ["평균 거리", `${b3.km}km`],
      ],
      source: "2025 하반기(139일) 실제 운송 실적 — 코드 계산",
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
    | {
        stub?: boolean;
        need?: string;
        road_social_environmental_cost_won?: number;
        rail_social_environmental_cost_won?: number;
        total_social_benefit_won?: number;
        basis?: { unitCostSource?: string };
      }
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
      title: "사회·환경비용 절감",
      rows: [
        ["도로로 보낼 때", `${c2.road_social_environmental_cost_won?.toLocaleString()}원`],
        ["철도로 보낼 때", `${c2.rail_social_environmental_cost_won?.toLocaleString()}원`],
        ["절감액", `${c2.total_social_benefit_won?.toLocaleString()}원`],
      ],
      source: c2.basis?.unitCostSource ?? "전환교통지원사업 공모 설명자료",
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
            className="rounded px-0.5 font-semibold text-[#112d4e] underline decoration-[#3f72af] decoration-dotted underline-offset-2 hover:bg-[#dbe2ef]"
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

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h3 className="text-[13px] font-semibold text-[#112d4e]">{title}</h3>
      {aside && <span className="text-[11px] text-[#112d4e]/45">{aside}</span>}
    </div>
  );
}

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [backhaul, setBackhaul] = useState<{ pairs: number; oneWay: number; backhaulPct: number } | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
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
  const lastTrace = [...msgs].reverse().find((m) => m.trace?.length)?.trace ?? [];
  const lastCards = cardsFromTrace(lastTrace);

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
      if (!ct.includes("application/json"))
        throw new Error(`서버 응답이 JSON이 아님 (HTTP ${res.status}) — /api/chat 배포 확인`);
      const data = await res.json();
      setMsgs([
        ...next,
        data.error
          ? { role: "assistant", text: data.error, isError: true, trace: data.trace }
          : { role: "assistant", text: data.text, trace: data.trace },
      ]);
      // 근거가 생겼을 때만 패널을 민다 — 평소엔 대화만 보인다.
      if (data.trace?.length) setPanelOpen(true);
    } catch (e) {
      setMsgs([...next, { role: "assistant", text: e instanceof Error ? e.message : "요청 실패", isError: true }]);
    } finally {
      setBusy(false);
    }
  }

  const asked = msgs.filter((m) => m.role === "user");

  return (
    // 화면을 꽉 채운다 — 층은 면 색과 헤어라인 보더로만 나눈다.
    <div className="flex h-screen bg-white text-[#112d4e]">
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* 상담 기록 */}
        <aside
          className={`hidden shrink-0 flex-col overflow-hidden border-r border-[#ededec] bg-white transition-[width] duration-300 lg:flex ${
            railOpen ? "w-[248px]" : "w-0 border-r-0"
          }`}
        >
          <div className="flex w-[248px] flex-1 flex-col px-3 py-3.5">
            <div className="flex items-center gap-2 px-1.5 pb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3f72af] text-xs font-bold text-white">철</div>
              <span className="text-sm font-semibold tracking-tight">전환 편익 콘솔</span>
            </div>

            <button
              onClick={() => {
                setMsgs([]);
                setPanelOpen(false);
              }}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-[#112d4e]/80 hover:bg-[#f5f5f4]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              새 상담
            </button>

            <p className="mt-4 px-2.5 pb-1.5 text-[11px] font-medium text-[#112d4e]/40">상담 기록</p>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
              {asked.length === 0 ? (
                <p className="px-2.5 py-2 text-[12px] leading-relaxed text-[#112d4e]/35">
                  아직 없습니다. 질문하면 여기 쌓입니다.
                </p>
              ) : (
                asked.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => document.getElementById(`q-${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#112d4e]/75 hover:bg-[#f5f5f4]"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-[#112d4e]/35" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinejoin="round" />
                    </svg>
                    <span className="truncate">{m.text}</span>
                  </button>
                ))
              )}
            </div>

            <div className="mt-2 flex items-center gap-2.5 border-t border-[#ededec] px-1.5 pt-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#112d4e] text-[10px] font-semibold text-white">영업</div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[12px] font-semibold">코레일 물류 영업</p>
                <p className="text-[10px] text-[#112d4e]/45">화주 미팅용</p>
              </div>
            </div>
          </div>
        </aside>

        {/* 본문 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 px-3.5 py-3">
            <button
              onClick={() => setRailOpen((v) => !v)}
              aria-label="상담 기록 접기"
              className="hidden rounded-lg p-1.5 text-[#112d4e]/45 hover:bg-[#f5f5f4] hover:text-[#112d4e] lg:block"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
              </svg>
            </button>
            <h1 className="truncate text-[15px] font-semibold tracking-tight">
              {active ? `${active.from} → ${active.to}` : "전환 편익 상담"}
            </h1>
            <span className="hidden rounded-md bg-[#f5f5f4] px-2 py-0.5 text-[11px] text-[#112d4e]/50 sm:inline">
              2025 하반기 139일 실적
            </span>

            <button
              onClick={() => setPanelOpen((v) => !v)}
              aria-label="근거 패널"
              className={`ml-auto rounded-lg border p-1.5 transition ${
                panelOpen
                  ? "border-[#3f72af] bg-[#eaf1fa] text-[#3f72af]"
                  : "border-transparent text-[#112d4e]/45 hover:bg-[#f5f5f4] hover:text-[#112d4e]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" strokeLinejoin="round" />
                <path d="M14 3v5h5M9 13h6M9 17h4" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            {/* 대화 */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5">
                <div className="mx-auto w-full max-w-[720px] space-y-6 py-6">
                  {msgs.length === 0 && (
                    <div className="pt-[8vh]">
                      <h2 className="text-[26px] font-semibold tracking-tight">화물을 철도로 옮기면 무엇이 나아질까요?</h2>
                      <p className="mt-2 text-[15px] leading-relaxed text-[#112d4e]/60">
                        구간을 말씀해 주시면 실제 운송 실적으로 물량·거리·회송 부담을 계산해 드립니다.
                        <br />
                        숫자는 코드가 계산하고, 근거가 없으면 없다고 답합니다.
                      </p>
                      <div className="mt-6 space-y-2">
                        {EXAMPLES.map((e) => (
                          <button
                            key={e}
                            onClick={() => send(e)}
                            className="flex w-full items-center gap-3 rounded-xl border border-[#ededec] px-4 py-3 text-left text-[14px] text-[#112d4e]/85 transition hover:border-[#3f72af] hover:bg-[#f9fbfd]"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#3f72af]" fill="none" stroke="currentColor" strokeWidth={1.8}>
                              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {msgs.map((m, i) =>
                    m.role === "user" ? (
                      <div key={i} id={`q-${asked.indexOf(m)}`} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl bg-[#112d4e] px-4 py-2.5 text-[15px] leading-relaxed text-white">
                          {m.text}
                        </div>
                      </div>
                    ) : (
                      <div
                        key={i}
                        className={`text-[15px] leading-[1.75] ${m.isError ? "rounded-xl border border-[#f0c088] bg-[#fdf6ec] px-4 py-3" : ""}`}
                      >
                        {m.isError ? (
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        ) : (
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
                        )}

                        {m.trace && m.trace.length > 0 && (
                          <button
                            onClick={() => setPanelOpen(true)}
                            className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg text-left"
                          >
                            {m.trace.map((t, j) => (
                              <span
                                key={j}
                                className="rounded-full bg-[#f5f5f4] px-2.5 py-1 text-[11px] font-medium text-[#112d4e]/65"
                              >
                                {TOOL_LABEL[t.tool] ?? t.tool}
                              </span>
                            ))}
                            <span className="text-[11px] font-semibold text-[#3f72af]">근거 보기 →</span>
                          </button>
                        )}
                      </div>
                    ),
                  )}

                  {busy && (
                    <p className="flex items-center gap-2 text-[14px] text-[#112d4e]/45">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3f72af]" />
                      실적을 조회하고 계산하는 중…
                    </p>
                  )}
                </div>
              </div>

              {/* 입력창 */}
              <div className="px-5 pb-4">
                <div className="mx-auto w-full max-w-[720px]">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send();
                    }}
                    className="rounded-2xl border border-[#e2e2e0] bg-white p-2.5 shadow-[0_2px_10px_-2px_rgba(17,45,78,0.10)] focus-within:border-[#3f72af]"
                  >
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={1}
                      placeholder="어느 구간을 어떻게 보내시나요?"
                      className="max-h-40 w-full resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-[#112d4e]/35"
                    />
                    <div className="flex items-center gap-2 px-1 pt-1">
                      <span className="text-[11px] text-[#112d4e]/40">
                        {summary ? `운송실적 ${summary.source.od_records.toLocaleString()}건 · 화물열차 ${summary.source.trains}편` : "데이터 불러오는 중…"}
                      </span>
                      <button
                        type="submit"
                        disabled={busy || !input.trim()}
                        className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-[#3f72af] text-white transition hover:bg-[#112d4e] disabled:opacity-30"
                        aria-label="질문 보내기"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </form>
                  <p className="mt-2 text-center text-[11px] text-[#112d4e]/35">
                    숫자는 코드가 계산합니다. 근거가 없는 값은 답하지 않습니다.
                  </p>
                </div>
              </div>
            </div>

            {/* 근거 패널 — 답이 나오면 밀려 나온다 */}
            <aside
              className={`hidden shrink-0 overflow-hidden transition-[width] duration-300 xl:block ${
                panelOpen ? "w-[400px]" : "w-0"
              }`}
            >
              <div className="flex h-full w-[400px] flex-col gap-4 overflow-y-auto border-l border-[#ededec] bg-[#f7f7f6] p-3.5">
                {/* 근거 카드 */}
                {lastCards.length > 0 && (
                  <section className="space-y-2">
                    <SectionHead title="이 답의 근거" aside={`계산 ${lastTrace.length}단계`} />
                    {lastCards.map((c, i) => (
                      <div
                        key={i}
                        className={`rounded-xl bg-white p-3.5 shadow-[0_1px_2px_rgba(17,45,78,0.05)] ${c.muted ? "border border-dashed border-[#dbe2ef]" : ""}`}
                      >
                        <p className="text-[12px] font-semibold text-[#3f72af]">{c.title}</p>
                        <dl className="mt-2 space-y-1.5">
                          {c.rows.map(([k, v], r) => (
                            <div key={r} className="flex justify-between gap-3 text-[12px]">
                              <dt className="shrink-0 whitespace-nowrap text-[#112d4e]/50">{k}</dt>
                              <dd className="text-right font-semibold tabular-nums break-words">{v}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="mt-2.5 border-t border-[#f0f0ef] pt-2 text-[10px] text-[#112d4e]/40">{c.source}</p>
                      </div>
                    ))}
                  </section>
                )}

                {/* 지도 */}
                <section className="space-y-2">
                  <SectionHead title="전국 물동량" aside={active ? `${active.from} → ${active.to}` : "선을 누르면 질문합니다"} />
                  <div className="rounded-xl bg-white p-1 shadow-[0_1px_2px_rgba(17,45,78,0.05)]">
                    {/* 지도 종횡비(400×560)에 맞춘 높이 — 낮으면 좌우가 비어 지도가 작아 보인다 */}
                    <div className="h-[490px]">
                      {flows.length > 0 ? (
                        <FlowMap
                          flows={flows}
                          active={active}
                          onPick={(f, t) => send(`${f}에서 ${t} 구간, 철도 전환하면 편익과 복화 가능성이 어떻게 되나요?`)}
                        />
                      ) : (
                        <p className="pt-24 text-center text-[13px] text-[#112d4e]/40">흐름 데이터를 불러오는 중…</p>
                      )}
                    </div>
                    <p className="border-t border-[#f0f0ef] px-3 py-2 text-[10px] leading-relaxed text-[#112d4e]/40">
                      2만 톤 이상 구간. 선 굵기 = 물량, 색 = 역방향 비중. 역 위치는 <strong>근사 좌표</strong>입니다.
                    </p>
                  </div>
                </section>

                {/* 계산 단계 */}
                <section className="space-y-2">
                  <SectionHead title="계산 단계" aside={allTrace.length ? `${allTrace.length}회 호출` : undefined} />
                  {allTrace.length === 0 ? (
                    <div className="rounded-xl bg-white p-3.5 shadow-[0_1px_2px_rgba(17,45,78,0.05)]">
                      <p className="text-[12px] text-[#112d4e]/45">질문하면 어떤 계산을 거쳤는지 여기 쌓입니다.</p>
                      {summary && (
                        <dl className="mt-3 space-y-1.5 border-t border-[#f0f0ef] pt-2.5">
                          {([
                            ["철도로 옮긴 화물", `${(summary.od.total_ton / 10000).toFixed(0)}만 톤`],
                            ...(backhaul
                              ? ([["빈 차로 돌아오는 구간", `${((backhaul.oneWay / backhaul.pairs) * 100).toFixed(1)}%`]] as [string, string][])
                              : []),
                            ["화물열차 실제 소요시간", `${summary.x_factor}배`],
                            ["정차가 차지하는 비중", `${summary.dwell_share_pct}%`],
                            ["화물 싣고 내리는 정차", `${Math.round(summary.dwell_min_by_reason["화물취급"] ?? 0).toLocaleString()}분`],
                          ] as [string, string][]).map(([k, v]) => (
                            <div key={k} className="flex items-baseline justify-between gap-3">
                              <dt className="text-[11px] text-[#112d4e]/55">{k}</dt>
                              <dd className="shrink-0 text-[12px] font-semibold tabular-nums">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  ) : (
                    <ol className="space-y-2">
                      {allTrace.map((t, i) => {
                        const out = t.output as { found?: boolean; stub?: boolean };
                        const status = out?.stub
                          ? ["공식 기준값 대기", "#3f72af"]
                          : out?.found === false
                            ? ["데이터 없음", "#c2410c"]
                            : ["계산 완료", "#15803d"];
                        return (
                          <li key={i} className="rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(17,45,78,0.05)]">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[12px] font-semibold">
                                <span className="text-[#112d4e]/35">{i + 1}.</span> {TOOL_LABEL[t.tool] ?? t.tool}
                              </p>
                              <span className="shrink-0 text-[10px] font-semibold" style={{ color: status[1] }}>
                                {status[0]}
                              </span>
                            </div>
                            <p className="mt-1.5 font-mono text-[10px] leading-relaxed break-all text-[#112d4e]/50">
                              in {JSON.stringify(t.input)}
                            </p>
                            <p className="mt-1 font-mono text-[10px] leading-relaxed break-all text-[#112d4e]/50">
                              out {JSON.stringify(t.output)}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>

                {/* 데이터 출처 */}
                <section className="space-y-2">
                  <SectionHead title="데이터 출처" aside={`${SOURCES.length}종`} />
                  <div className="rounded-xl bg-white p-3.5 shadow-[0_1px_2px_rgba(17,45,78,0.05)]">
                    <dl className="space-y-2">
                      {SOURCES.map(([name, src]) => (
                        <div key={name}>
                          <dt className="text-[12px] font-semibold">{name}</dt>
                          <dd className="text-[11px] leading-relaxed text-[#112d4e]/55">{src}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 border-t border-[#f0f0ef] pt-2.5 text-[11px] leading-relaxed text-[#112d4e]/60">
                      시간표와 운송 실적은 <strong className="text-[#112d4e]">역 단위로 강제 조인하지 않습니다</strong> — 조인율이
                      79%라 부산신항·신광양항 같은 역이 누락되기 때문입니다.
                    </p>
                  </div>
                </section>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
