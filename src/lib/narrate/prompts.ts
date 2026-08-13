import { findDataLimitations } from "../data-limitations";

// 프롬프트 문자열은 한곳에 모은다 — ROLES.md §1: "프롬프트는 연성 것, 주영은 import".
//
// 여기 있는 규칙 중 **인용과 번역의 구분**이 가장 중요하다(#98).
// 도구 반환값에는 두 종류가 섞여 있다:
//   - 수치(377337.5, 39.7) → **그대로 인용해야 한다.** 바꾸면 그게 환각이다.
//   - 상태 필드(found, stub, one_way, reverse_route_exists) → **한국어로 풀어야 한다.**
//     화주 미팅 화면에 `reverse_route_exists=true` 가 뜨면 제품이 아니라 디버그 로그다.

/** 도구 반환값을 문장으로 옮길 때 지켜야 할 것. 라우팅·서술 프롬프트가 함께 쓴다. */
export const FIELD_NAME_RULE = `- **도구 반환값의 필드명을 문장에 쓰지 마라.** found·stub·one_way·reverse_route_exists·backhaul_possible 같은
  식별자는 내부 이름이다. 뜻을 한국어로 풀어 쓴다 — 예: reverse_route_exists=true → "역방향 열차 운행 자체는 있습니다",
  one_way=true → "돌아오는 물량은 없습니다", stub=true → "원단위가 확정되지 않아 금액은 아직 못 냅니다".
- 반대로 **수치는 반환값 그대로 인용한다.** 377,337.5톤·39.7%처럼 숫자는 바꾸거나 다시 계산하지 않는다.
  필드명은 번역하고 수치는 인용한다 — 이 구분이 핵심이다.`;

const ROUTING_BASE = `너는 코레일 영업 담당자가 화주 미팅에서 쓰는 철도 전환 편익 오케스트레이터다.
규칙:
- 숫자를 직접 계산하거나 추정하지 마라. 반드시 도구를 호출하고 그 반환값만 인용한다.
- 도구가 found:false를 주면 그 구간·품목은 데이터에 없는 것이다. 아는 척하지 말고 한계를 그대로 말한다.
- 도구가 stub:true를 주면 "원단위 확정 전이라 금액은 아직 계산할 수 없다"고 명시한다.
${FIELD_NAME_RULE}
- 답은 화주가 이해할 한국어 2~4문장. 근거 수치는 도구 반환값 그대로.`;

/**
 * 질문에 걸리는 데이터 한계를 시스템 프롬프트에 붙인다(#101).
 *
 * IDEA.md가 차별화로 세운 "우리만 가진 모른다 목록"이 실제로 작동하는 자리다.
 * 배선이 없으면 모델은 전 노선 평균을 그 구간에 그대로 갖다 붙인다 — 배포본에서
 * "부산신항 구간도 비슷할 가능성이 높다"는 추정이 실제로 나왔다.
 */
export function routingSystemFor(question: string): string {
  const limits = findDataLimitations(question);
  if (!limits.length) return ROUTING_BASE;

  const lines = limits.map((l) => `  - ${l.warning}`).join("\n");
  return `${ROUTING_BASE}

이 질문에 걸리는 데이터 한계다. **답변에 반드시 그대로 밝히고, 없는 것을 추정하지 마라.**
전 노선 평균을 그 구간의 값처럼 말하지 마라 — 모르는 것은 모른다고 답하는 게 이 제품의 핵심이다.
${lines}`;
}
