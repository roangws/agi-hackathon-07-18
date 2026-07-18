#!/usr/bin/env python3
"""Generate one iridescent liquid-chrome orb per agent (image) and turn each into a
short looping video via GMI (gemini-omni-flash-preview). Saves poster PNG + MP4 to
assets/orbs/.  Videos are async → we submit all, then poll."""
import json, urllib.request, concurrent.futures, time, pathlib

KEY = None
for line in open(".env"):
    if line.startswith("gmi-api-key="):
        KEY = line.strip().split("=", 1)[1]
assert KEY

OUT = pathlib.Path("assets/orbs"); OUT.mkdir(parents=True, exist_ok=True)
EP = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests"
HDR = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# agent id -> dominant iridescent hue
AGENTS = {
    "atlas":  "warm gold and amber",
    "david":  "electric blue and azure",
    "nova":   "emerald green and lime",
    "sven":   "violet and deep purple",
    "echo":   "cyan and aqua",
    "vega":   "orange and coral red",
    "iris":   "magenta and hot pink",
    "zephyr": "teal and mint",
}

def post(model, payload):
    req = urllib.request.Request(EP, data=json.dumps({"model": model, "payload": payload}).encode(),
                                 method="POST", headers=HDR)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

def get(rid):
    req = urllib.request.Request(f"{EP}/{rid}", headers=HDR)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def download(url, dst):
    with urllib.request.urlopen(url, timeout=180) as s, open(dst, "wb") as f:
        f.write(s.read())

def gen_image(item):
    aid, hue = item
    prompt = (f"a single smooth iridescent liquid chrome metaball sphere, glossy oil-slick "
              f"holographic reflections with dominant {hue} tones, floating centered on pure "
              f"black background, soft studio lighting, premium minimalist 3d render, no text")
    try:
        d = post("gpt-image-2-generate", {"prompt": prompt, "size": "1024x1024",
                 "quality": "medium", "output_format": "png", "n": 1})
        url = d["outcome"]["media_urls"][0]["url"]
        download(url, OUT / f"orb-{aid}.png")
        return aid, url
    except Exception as e:
        print(f"IMG FAIL {aid}: {e}"); return aid, None

def submit_video(item):
    aid, img_url = item
    if not img_url: return aid, None
    prompt = ("the iridescent chrome orb gently morphs and undulates in place, liquid metal "
              "surface slowly flowing, holographic colors shifting, seamless subtle loop, "
              "floating on a pure black background, no camera movement")
    try:
        d = post("gemini-omni-flash-preview", {"prompt": prompt, "reference_image": [img_url],
                 "durationSeconds": 5, "aspectRatio": "16:9"})
        return aid, d.get("request_id")
    except Exception as e:
        print(f"VID SUBMIT FAIL {aid}: {e}"); return aid, None

if __name__ == "__main__":
    print(f"Generating {len(AGENTS)} orb images...")
    imgs = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(AGENTS)) as ex:
        for aid, url in ex.map(gen_image, AGENTS.items()):
            imgs[aid] = url
            print(f"  img {aid}: {'ok' if url else 'FAIL'}")

    print("Submitting video jobs...")
    jobs = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(AGENTS)) as ex:
        for aid, rid in ex.map(submit_video, imgs.items()):
            if rid: jobs[aid] = rid
            print(f"  vid {aid}: {rid or 'FAIL'}")

    print(f"Polling {len(jobs)} video jobs (poster PNGs already saved as fallback)...")
    pending = dict(jobs); done = {}
    deadline = 900  # seconds; posters cover any that lag
    waited = 0
    while pending and waited < deadline:
        time.sleep(12); waited += 12
        for aid in list(pending):
            try:
                r = get(pending[aid]); st = r.get("status")
                if st == "success":
                    url = r["outcome"]["media_urls"][0]["url"]
                    download(url, OUT / f"orb-{aid}.mp4")
                    done[aid] = "ok"; del pending[aid]
                    print(f"  [{waited}s] {aid}: DONE -> orb-{aid}.mp4")
                elif st in ("failed", "error"):
                    done[aid] = "fail"; del pending[aid]
                    print(f"  [{waited}s] {aid}: FAILED (keeping poster)")
            except Exception as e:
                print(f"  poll err {aid}: {e}")
        if pending: print(f"  [{waited}s] still processing: {list(pending)}")
    print(f"DONE. videos ok: {sum(1 for v in done.values() if v=='ok')}/{len(jobs)}; "
          f"posters: {sum(1 for u in imgs.values() if u)}/{len(AGENTS)}")
