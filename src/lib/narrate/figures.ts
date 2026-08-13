// D3(#44): 서술에 등장한 숫자가 실제 도구 반환값에 있는지 검사한다.
//
// "숫자는 코드가, 해석은 AI가"를 프롬프트 부탁이 아니라 코드로 강제하는 자리다.
// LLM이 톤을 바꾸다 보면 반올림하거나 단위를 환산하면서 없는 숫자를 만든다.
// 그걸 통과시키면 이 프로젝트의 신뢰도가 통째로 무너지므로 여기서 잡는다.

export type Trace = { tool: string; input: unknown; output: unknown };

/** 도구 반환값에 등장하는 모든 수를 모은다 (중첩 객체 포함). */
export function allowedFigures(trace: readonly Trace[]): Set<number> {
  const out = new Set<number>();
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  trace.forEach((t) => {
    walk(t.output);
    walk(t.input);
  });
  return out;
}

const MYRIAD: Record<string, number> = { 억: 1e8, 만: 1e4, 천: 1e3 };

/**
 * 서술에서 수를 뽑는다. 3자리 구분 쉼표를 제거하고 소수점은 살린다.
 *
 * 한국어는 큰 수를 `1억5,399만`처럼 쓴다. 이걸 조각으로 뜯으면 `1`과 `5399`가 나오는데,
 * 도구는 `153990000`을 돌려줬으므로 `5399`가 근거 없는 수로 오인된다. 실제 데모 답변에서
 * 나온 오탐이라, 자릿수 단위가 붙은 덩어리는 하나의 수로 합산해서 본다.
 */
export function figuresIn(text: string): number[] {
  const runs =
    text.match(/\d[\d,]*(?:\.\d+)?(?:\s*[억만천])?(?:\s*\d[\d,]*(?:\.\d+)?(?:\s*[억만천])?)*/g) ?? [];
  const out: number[] = [];

  for (const run of runs) {
    const parts = [...run.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([억만천])?/g)];
    const nums = parts.map(([, n, u]) => ({ n: Number(n.replace(/,/g, "")), u }));
    if (nums.some((p) => !Number.isFinite(p.n))) continue;

    if (nums.some((p) => p.u)) {
      // 단위가 하나라도 있으면 덩어리 전체가 하나의 수다. `1억5,399만` → 153990000
      out.push(nums.reduce((s, p) => s + p.n * (p.u ? MYRIAD[p.u] : 1), 0));
    } else {
      // 단위가 없으면 그냥 나열된 수들이다. 합치면 없는 수를 만들어낸다.
      nums.forEach((p) => out.push(p.n));
    }
  }
  return out;
}

// 연도·횟수·순위처럼 데이터와 무관하게 문장에 나오는 수. 이것까지 잡으면 오탐만 늘어난다.
const IGNORED = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 2024, 2025, 2026]);

/**
 * 서술이 인용한 수 중 도구 반환값에 없는 것을 돌려준다.
 * 반올림 표기를 허용하려고 원본을 0.1·1·10 단위로 반올림한 값도 근거로 인정한다.
 */
export function unsupportedFigures(text: string, allowed: ReadonlySet<number>): number[] {
  const widened = new Set<number>();
  for (const n of allowed) {
    widened.add(n);
    widened.add(Math.round(n * 10) / 10);
    widened.add(Math.round(n));
    widened.add(Math.round(n / 10) * 10);
    widened.add(Math.round(n / 1000) * 1000);
    // 서술은 큰 수를 만 단위로 반올림해 쓴다. `1억5,399만` 은 153990000 이므로
    // ×10000 단이 없으면 파싱이 맞아도 근거로 인정되지 않는다.
    widened.add(Math.round(n / 10000) * 10000);
    widened.add(Math.round(n / 10000)); // `37.7만` 을 37.7 로 읽던 시절의 단 — 호환용
    widened.add(Math.round((n / 10000) * 10) / 10);
  }
  return [...new Set(figuresIn(text))].filter((n) => !IGNORED.has(n) && !widened.has(n));
}
