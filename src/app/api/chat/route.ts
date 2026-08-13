// D1(#39): 라우팅 루프 — LLM이 도구를 고르고, 코드가 계산하고, LLM이 결과만 서술한다.
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, runTool, gateTool } from "@/lib/orchestrator";

const SYSTEM = `너는 코레일 영업 담당자가 화주 미팅에서 쓰는 철도 전환 편익 오케스트레이터다.
규칙:
- 숫자를 직접 계산하거나 추정하지 마라. 반드시 도구를 호출하고 그 반환값만 인용한다.
- 도구가 found:false를 주면 그 구간·품목은 데이터에 없는 것이다. 아는 척하지 말고 한계를 그대로 말한다.
- 도구가 stub:true를 주면 "원단위 확정 전이라 금액은 아직 계산할 수 없다"고 명시한다.
- 답은 화주가 이해할 한국어 2~4문장. 근거 수치는 도구 반환값 그대로.`;

type Trace = { tool: string; input: unknown; output: unknown };

export async function POST(req: Request) {
  const { messages } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return Response.json(
      { error: "ANTHROPIC_API_KEY 없음 — .env와 Vercel 환경변수에 넣어야 라우팅이 동작한다 (#39)" },
      { status: 501 },
    );

  const client = new Anthropic({ apiKey });
  const trace: Trace[] = [];
  const blocked: { tool: string; note: string }[] = [];
  const msgs: Anthropic.MessageParam[] = [...messages];

  for (let round = 0; round < 8; round++) {
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: SYSTEM,
      tools: TOOLS,
      messages: msgs,
    });
    if (res.stop_reason !== "tool_use") {
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return Response.json({ text, trace, blocked });
    }
    msgs.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;
      const gate = gateTool(block.name, input, trace);
      // 막힌 호출은 실행되지 않았으므로 trace에 남기지 않는다 — trace는 "실제로 계산에
      // 쓰인 도구"만 담아야 근거 배지와 호출 순서 검증이 둘 다 성립한다.
      if (gate) blocked.push({ tool: block.name, note: gate.note });
      const output = gate ?? (await runTool(block.name, input));
      if (!gate) trace.push({ tool: block.name, input: block.input, output });
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output) });
    }
    msgs.push({ role: "user", content: results });
  }
  return Response.json({ error: "도구 호출 한도(8회) 초과", trace, blocked }, { status: 500 });
}
