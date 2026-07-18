#!/usr/bin/env python3
"""Generate all visual assets for the Cotal Command Deck via GMI Cloud image API.
Runs requests in parallel (each takes ~60s), downloads PNGs into assets/img/."""
import json, os, sys, urllib.request, concurrent.futures, pathlib

KEY = None
for line in open(".env"):
    if line.startswith("gmi-api-key="):
        KEY = line.strip().split("=", 1)[1]
assert KEY, "no gmi-api-key in .env"

OUT = pathlib.Path("assets/img"); OUT.mkdir(parents=True, exist_ok=True)
ENDPOINT = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests"

# Shared style so avatars/scenes feel like one system.
AVATAR_STYLE = ("centered emblem, glowing neon holographic outline, dark charcoal background, "
                "futuristic AI agent mascot, clean vector-3D hybrid, symmetrical, "
                "rim light, high detail, no text, no words")
SCENE_STYLE = ("cinematic, dark cyberpunk control room aesthetic, deep blacks, neon accents, "
               "volumetric glow, ultra high detail, no text, no words")

# (filename, prompt, size)
JOBS = [
    # --- 8 agent avatars, distinct hues ---
    ("agent-atlas.png",  f"a majestic golden owl-like AI orchestrator core, amber and gold energy, {AVATAR_STYLE}", "1024x1024"),
    ("agent-david.png",  f"a blue hexagonal engineer robot head, electric blue circuits, {AVATAR_STYLE}", "1024x1024"),
    ("agent-nova.png",   f"a green crystalline reviewer eye, emerald scanning beams, {AVATAR_STYLE}", "1024x1024"),
    ("agent-sven.png",   f"a violet wise guide orb with rings, purple aurora, {AVATAR_STYLE}", "1024x1024"),
    ("agent-echo.png",   f"a cyan soundwave researcher sphere, teal ripples, {AVATAR_STYLE}", "1024x1024"),
    ("agent-vega.png",   f"a red-orange alert ops sentinel, molten orange shield, {AVATAR_STYLE}", "1024x1024"),
    ("agent-iris.png",   f"a pink prism designer flower, magenta light refraction, {AVATAR_STYLE}", "1024x1024"),
    ("agent-zephyr.png", f"a silver-teal analyst constellation node, mint data streams, {AVATAR_STYLE}", "1024x1024"),
    # --- backgrounds / scene art ---
    ("bg-hero.png",      f"a vast glowing 3D network mesh of interconnected agent nodes floating in dark space, blue and purple neon, depth of field, {SCENE_STYLE}", "1920x1080"),
    ("bg-deck.png",      f"an abstract dark grid floor stretching to horizon with faint neon node lights, subtle, {SCENE_STYLE}", "1920x1080"),
    ("scene-death.png",  f"a single agent node shattering into glowing particles, dramatic red-to-blue energy dissipation, dark background, {SCENE_STYLE}", "1024x1024"),
    ("scene-resume.png", f"a stream of light flowing from a durable ledger crystal into a reborn glowing node, revival energy, blue-green, {SCENE_STYLE}", "1024x1024"),
    ("scene-ledger.png", f"an infinite scrolling ribbon of glowing ordered log entries, timeline of light, cyan, {SCENE_STYLE}", "1024x1024"),
    ("emblem-cotal.png", f"three interlocking glowing circles forming a trinity knot emblem, gold and white light, minimal, {AVATAR_STYLE}", "1024x1024"),
    # --- extra flavor to reach ~20 ---
    ("scene-channel.png", f"floating holographic chat channels with message bubbles of light between agent nodes, {SCENE_STYLE}", "1024x1024"),
    ("scene-presence.png", f"a ring of pulsing presence status lights, green amber and grey orbs glowing, {SCENE_STYLE}", "1024x1024"),
    ("scene-anycast.png", f"a task packet of light being routed and caught by one of several waiting agent nodes, {SCENE_STYLE}", "1024x1024"),
    ("scene-incident.png", f"a red alert warning beacon pulsing over an agent operations mesh, tense, {SCENE_STYLE}", "1024x1024"),
    ("agent-generic.png", f"a neutral grey standby AI agent node, dim white outline, {AVATAR_STYLE}", "1024x1024"),
    ("bg-vignette.png",  f"a subtle dark radial vignette texture with faint blue noise particles, {SCENE_STYLE}", "1920x1080"),
]

def gen(job):
    name, prompt, size = job
    body = json.dumps({
        "model": "gpt-image-2-generate",
        "payload": {"prompt": prompt, "size": size, "quality": "medium",
                    "output_format": "png", "n": 1},
    }).encode()
    req = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
        "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.load(r)
        url = data["outcome"]["media_urls"][0]["url"]
        dst = OUT / name
        with urllib.request.urlopen(url, timeout=120) as img, open(dst, "wb") as f:
            f.write(img.read())
        return (name, "OK", dst.stat().st_size)
    except Exception as e:
        return (name, f"FAIL {e}", 0)

if __name__ == "__main__":
    print(f"Generating {len(JOBS)} images in parallel...")
    ok = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(JOBS)) as ex:
        for name, status, sz in ex.map(gen, JOBS):
            flag = "OK " if status == "OK" else "XX "
            if status == "OK": ok += 1
            print(f"{flag}{name}  {sz//1024 if sz else 0}KB  {status if status!='OK' else ''}")
    print(f"DONE: {ok}/{len(JOBS)} succeeded")
