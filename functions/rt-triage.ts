// InsForge edge function: proxy to the RunType flow (hachathon_agent).
// Keeps the RunType key server-side (InsForge secrets) and adds CORS so the
// deployed deck can call it from any origin. POST {message} -> {text}.
export default async function (req: Request): Promise<Response> {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ enabled: !!Deno.env.get("RUNTYPE_KEY") }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  try {
    const { message } = await req.json();
    const base = Deno.env.get("RUNTYPE_BASE");
    const key = Deno.env.get("RUNTYPE_KEY");
    const r = await fetch(base + "/dispatch", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ capability: "hachathon_agent", input: { message } }),
    });
    let out = await r.json();
    if (typeof out !== "string") out = out.output || out.summary || JSON.stringify(out);
    return new Response(JSON.stringify({ text: String(out).trim() }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
