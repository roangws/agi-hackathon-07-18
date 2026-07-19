// InsForge edge function: live agent chat powered by a GMI model.
// Keeps the GMI key server-side (InsForge secret). POST {system, message} -> {text}.
export default async function (req: Request): Promise<Response> {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const MODEL = "anthropic/claude-haiku-4.5";
  if (req.method === "GET") {
    return new Response(JSON.stringify({ enabled: !!Deno.env.get("GMI_KEY"), model: MODEL }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const CONTEXT = "You are an AI agent on Cotal, an open multi-agent mesh (\"Slack for your agents\") " +
    "with channels, DMs, presence, anycast task routing, and a durable replayable JetStream log so " +
    "work survives an agent crashing mid-task. Answer as your character, grounded in this system. " +
    "Never ask for an image. Keep replies to 1-2 short sentences.";
  try {
    const { system, message, model } = await req.json();
    const key = Deno.env.get("GMI_KEY");
    const r = await fetch("https://api.gmi-serving.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || MODEL,
        messages: [
          { role: "system", content: CONTEXT + "\n" + (system || "") },
          { role: "user", content: String(message || "").slice(0, 2000) },
        ],
        max_tokens: 220,
        temperature: 0.7,
      }),
    });
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content?.trim() || "(no response)";
    return new Response(JSON.stringify({ text }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
