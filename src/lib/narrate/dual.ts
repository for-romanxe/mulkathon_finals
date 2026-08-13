// D3(#44): 같은 계산 결과를 화주용·정책용 두 논지로 서술한다.
//
// 왜 둘인가 — 쓰는 사람은 코레일 영업 하나인데, 그가 마주하는 상대가 둘이다.
// 화주에게는 "당신 회사에 무엇이 남는가", 정책 담당에게는 "공공이 무엇을 얻는가".
// 숫자는 같아야 하고 논지만 달라야 한다. 숫자가 갈리면 둘 중 하나는 지어낸 것이다.
import Anthropic from "@anthropic-ai/sdk";
import { allowedFigures, unsupportedFigures, type Trace } from "./figures";
import { FIELD_NAME_RULE } from "./prompts";

export const NARRATION_SYSTEM = `너는 코레일 영업 담당자가 화주 미팅에서 쓰는 자료를 쓴다.
아래 도구 호출 결과만 근거로, 같은 사실을 두 상대에게 다르게 설명하라.

- shipper(화주용): 화주 회사에 무엇이 남는가. 물량·거리·방향 여건을 그의 운송 조건 언어로.
- policy(정책용): 공공이 무엇을 얻는가. 전환 물량이 도로에서 빠지는 의미로.

지켜야 할 것:
- 숫자는 도구 반환값에 있는 것만 쓴다. 반올림은 허용하되 없는 수를 만들지 마라.
- 두 서술은 반드시 같은 수치를 인용한다. 논지와 어휘만 다르다.
- 원단위가 확정되지 않아 stub:true가 온 항목은 금액을 말하지 말고 "확정 전"이라고 밝힌다.
- found:false인 구간은 없는 것이다. 추정하지 마라.
${FIELD_NAME_RULE}
- 각 서술 2~4문장, 한국어.

반드시 이 JSON만 출력한다: {"shipper":"...","policy":"..."}`;

export type DualNarrative = {
  shipper: string;
  policy: string;
  /** 도구 반환값으로 뒷받침되지 않는 수. 비어 있어야 정상이다. */
  unsupported: { shipper: number[]; policy: number[] };
};

function parseJson(text: string): { shipper?: string; policy?: string } {
  const body = text.match(/\{[\s\S]*\}/)?.[0];
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

/**
 * 도구 호출 흔적을 받아 두 서술을 만들고, 각 서술이 인용한 수를 검증한다.
 * 검증은 차단이 아니라 표시다 — 어떤 수가 근거 없는지 화면이 알 수 있어야 한다.
 */
export async function narrateDual(
  client: Anthropic,
  question: string,
  trace: readonly Trace[],
): Promise<DualNarrative | null> {
  if (!trace.length) return null;

  const res = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: NARRATION_SYSTEM,
    messages: [
      {
        role: "user",
        content: `질문: ${question}\n\n도구 호출 결과:\n${JSON.stringify(trace, null, 1)}`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const { shipper, policy } = parseJson(text);
  if (!shipper || !policy) return null;

  const allowed = allowedFigures(trace);
  return {
    shipper,
    policy,
    unsupported: {
      shipper: unsupportedFigures(shipper, allowed),
      policy: unsupportedFigures(policy, allowed),
    },
  };
}
