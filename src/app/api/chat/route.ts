// D1(#39): 라우팅 루프 — LLM이 도구를 고르고, 코드가 계산하고, LLM이 결과만 서술한다.
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, runTool, gateTool } from "@/lib/orchestrator";
import { narrateDual } from "@/lib/narrate/dual";
import { checkScope, refusalText } from "@/lib/narrate/scope";
import { routingSystemFor } from "@/lib/narrate/prompts";

type Trace = { tool: string; input: unknown; output: unknown };

export async function POST(req: Request) {
  const { messages } = await req.json();

  // D4(#46): 구조적 범위 밖 질문은 도구를 부르기 전에 끊는다. LLM에 맡기면 추정이 새어 나온다.
  const asked = [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content ?? "";
  const outOfScope = checkScope(String(asked));
  if (outOfScope)
    return Response.json({ text: refusalText(outOfScope), trace: [], outOfScope: outOfScope.category });

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
      system: routingSystemFor(String(asked)),
      tools: TOOLS,
      messages: msgs,
    });
    if (res.stop_reason !== "tool_use") {
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      // D3(#44): 같은 수치를 화주용·정책용 두 논지로. 도구를 한 번도 안 불렀으면 서술할 근거가 없다.
      // 서술은 부가 기능이다 — 여기서 실패해도 이미 계산이 끝난 주 답변은 그대로 나가야 한다.
      const question = [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content ?? "";
      let dual = null;
      try {
        dual = await narrateDual(client, String(question), trace);
      } catch (err) {
        console.error("D3 서술 생성 실패 — 주 답변은 그대로 반환", err);
      }
      return Response.json({ text, trace, blocked, dual });
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
