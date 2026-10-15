"""Kit data for the 24 clubs + an SVG jersey renderer and preview sheet.

pattern : plain | hoops | stripes | halves | quarters
width   : broad | thin            (hoops/stripes only; thin = pinstripe lines of colours[1] on colours[0])
edge    : optional thin line colour between hoop bands (Northampton's gold)
accent  : null | fade | tartan | side-panels | shoulders | band | chevrons
jazz    : true when the accent is invented to liven up a plain kit (not on the real shirt)
season  : which kit it's based on: 2026/27, 2025/26, or traditional (no reliable kit info found)
"""
import json, sys

K = {
 "union-bordeaux-begles": dict(pattern="quarters", colours=["#6b1e35", "#14213d"], trim="#ffffff", season="2025/26",
     note="Claret with dark blue quarters."),
 "bath-rugby": dict(pattern="hoops", width="broad", colours=["#0054a6", "#000000", "#ffffff"], trim="#000000", season="2025/26",
     note="Blue, black and white hoops."),
 "bristol-bears": dict(pattern="plain", colours=["#1d2b6f"], accent="fade", accentColours=["#3a6fd8"], trim="#ffffff", season="2025/26",
     note="Two-tone blue."),
 "vodacom-bulls": dict(pattern="plain", colours=["#0b1f4b"], accent="fade", accentColours=["#2581c4"], trim="#e30714", season="2026/27",
     note="Navy shoulders fading to Loftus blue; real shirt also has a street-map graphic."),
 "cardiff-rugby": dict(pattern="quarters", colours=["#000000", "#89bde3"], trim="#c9a227", season="2026/27",
     note="Black and sky blue quarters, thin gold stripe on the cuffs (150th anniversary)."),
 "asm-clermont-auvergne": dict(pattern="plain", colours=["#fdea00"], accent="shoulders", accentColours=["#002f6c"], jazz=True, trim="#002f6c", season="2025/26",
     note="Yellow and blue. Real shirt is plain yellow with a subtle motif; navy yoke added."),
 "connacht": dict(pattern="plain", colours=["#0b3d2a"], accent="side-panels", accentColours=["#2fbf5f"], trim="#2fbf5f", season="2026/27",
     note="Very dark green, bright green geometric graphic down the sides."),
 "exeter-chiefs": dict(pattern="plain", colours=["#000000"], accent="side-panels", accentColours=["#8fc3e8"], trim="#fecc00", season="2026/27",
     note="Retro 2006 Sandy Park shirt with light blue panelling. Base colour not confirmed: check."),
 "glasgow-warriors": dict(pattern="plain", colours=["#0b0b0f"], accent="tartan", accentColours=["#84aed1", "#3d6a99", "#8d939b"], trim="#84aed1", season="2026/27",
     note="Black with blue detailing and the club's Laoch tartan."),
 "gloucester-rugby": dict(pattern="hoops", width="broad", colours=["#c8102e", "#ffffff"], trim="#8a8d8f", season="2026/27",
     note="Cherry and white hoops, grey collar."),
 "leicester-tigers": dict(pattern="plain", colours=["#094438"], accent="side-panels", accentColours=["#c8102e", "#ffffff"], trim="#ffffff", season="2025/26",
     note="Green block chest with red and white side panels."),
 "leinster": dict(pattern="hoops", width="broad", colours=["#0053a1", "#ffffff"], trim="#0a2d5c", season="2026/27",
     note="Blue and white hoops, a 2001 throwback."),
 "emirates-lions": dict(pattern="plain", colours=["#dc2129"], accent="chevrons", accentColours=["#ffffff"], jazz=True, trim="#ffffff", season="traditional",
     note="Red and white. No 26/27 kit info found; white chevrons added."),
 "montpellier-herault-rugby": dict(pattern="stripes", width="broad", colours=["#002c5b", "#0090d4"], trim="#ffffff", season="2025/26",
     note="Vertical stripes; Hummel chevrons on the sleeves."),
 "munster-rugby": dict(pattern="plain", colours=["#c8102e"], accent="shoulders", accentColours=["#122053"], trim="#122053", season="2026/27",
     note="Red with navy shoulders and arms (adidas 2025-27 home). European shirt: red with a Thomond Park graphic, burgundy shorts."),
 "northampton-saints": dict(pattern="hoops", width="broad", colours=["#0e6240", "#000000"], edge="#f2b226", trim="#000000", season="2026/27",
     note="Broad green and black hoops, thin gold line under each black hoop."),
 "section-paloise": dict(pattern="plain", colours=["#004231"], accent="band", accentColours=["#ffffff"], trim="#ffffff", season="2025/26",
     note="Green with a white block across the front."),
 "racing-92": dict(pattern="hoops", width="broad", colours=["#7fc4ef", "#ffffff"], trim="#0b1f4b", season="traditional",
     note="Sky blue and white hoops (classic look; 25/26 shirt was plainer)."),
 "stade-rochelais": dict(pattern="plain", colours=["#171412"], accent="band", accentColours=["#fed100"], jazz=True, trim="#fed100", season="2025/26",
     note="Black with a yellow collar. Yellow chest band added."),
 "sale-sharks": dict(pattern="plain", colours=["#0a1f6b"], accent="side-panels", accentColours=["#f2b226", "#b5412a"], trim="#ffffff", season="2026/27",
     note="Deep blue; Lowry-inspired yellow and burnt red side panels and cuffs."),
 "saracens": dict(pattern="plain", colours=["#120a09"], accent="fade", accentColours=["#c8102e"], trim="#c8102e", season="2025/26",
     note="Black fading to red."),
 "stade-francais-paris": dict(pattern="plain", colours=["#ea5097"], accent="chevrons", accentColours=["#002c5b"], jazz=True, trim="#002c5b", season="2025/26",
     note="Pink and navy. Real shirt has Eiffel Tower and lightning graphics; navy chevrons added."),
 "dhl-stormers": dict(pattern="hoops", width="broad", colours=["#00358e", "#ffffff"], trim="#ffffff", season="2026/27",
     note="Blue and white hoops, white collar, black shorts."),
 "stade-toulousain": dict(pattern="hoops", width="thin", colours=["#0a0a0a", "#d30c14"], trim="#d30c14", season="2025/26",
     note="Black with thin red hoops."),
}

SHIRT = ("M70 12 L52 18 L8 44 L22 86 L44 78 L44 206 Q100 214 156 206 L156 78 L178 86 L192 44 L148 18 L130 12"
         " Q100 34 70 12 Z")

def jersey_svg(slug, kit, size=150):
    c = kit["colours"]; cid = f"clip-{slug}"
    parts = []
    p = kit["pattern"]
    if p == "plain":
        if kit.get("accent") == "fade":
            parts.append(f'<defs><linearGradient id="g-{slug}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.15" stop-color="{c[0]}"/>'
                         f'<stop offset="1" stop-color="{kit["accentColours"][0]}"/></linearGradient></defs>'
                         f'<rect width="200" height="220" fill="url(#g-{slug})"/>')
        else:
            parts.append(f'<rect width="200" height="220" fill="{c[0]}"/>')
    elif p == "hoops":
        parts.append(f'<rect width="200" height="220" fill="{c[0]}"/>')
        if kit.get("width") == "thin":
            for y in range(40, 215, 18):
                parts.append(f'<rect x="0" y="{y}" width="200" height="4" fill="{c[1]}"/>')
        else:
            h = 26; i = 0
            for y in range(10, 220, h):
                col = c[i % len(c)]
                parts.append(f'<rect x="0" y="{y}" width="200" height="{h}" fill="{col}"/>')
                if kit.get("edge") and col == c[-1]:
                    parts.append(f'<rect x="0" y="{y+h-3}" width="200" height="3" fill="{kit["edge"]}"/>')
                i += 1
    elif p == "stripes":
        parts.append(f'<rect width="200" height="220" fill="{c[0]}"/>')
        if kit.get("width") == "thin":
            for x in range(10, 200, 14):
                parts.append(f'<rect x="{x}" y="0" width="3" height="220" fill="{c[1]}"/>')
        else:
            for i, x in enumerate(range(0, 200, 22)):
                parts.append(f'<rect x="{x}" y="0" width="22" height="220" fill="{c[i % len(c)]}"/>')
    elif p == "halves":
        parts.append(f'<rect width="100" height="220" fill="{c[0]}"/><rect x="100" width="100" height="220" fill="{c[1]}"/>')
    elif p == "quarters":
        parts.append(f'<rect width="100" height="110" fill="{c[0]}"/><rect x="100" width="100" height="110" fill="{c[1]}"/>'
                     f'<rect y="110" width="100" height="110" fill="{c[1]}"/><rect x="100" y="110" width="100" height="110" fill="{c[0]}"/>')
    a = kit.get("accent"); ac = kit.get("accentColours", [])
    if a == "tartan":
        for i, x in enumerate(range(0, 200, 24)):
            parts.append(f'<rect x="{x}" y="0" width="8" height="220" fill="{ac[i % len(ac)]}" opacity="0.35"/>')
        for i, y in enumerate(range(0, 220, 24)):
            parts.append(f'<rect x="0" y="{y}" width="200" height="8" fill="{ac[(i+1) % len(ac)]}" opacity="0.35"/>')
        parts.append(f'<g opacity="0.5">' + "".join(f'<rect x="{x+11}" y="0" width="1.5" height="220" fill="{ac[0]}"/>' for x in range(0, 200, 24)) + '</g>')
    elif a == "side-panels":
        for i, col in enumerate(ac):
            w = 12; off = 44 + i * w
            parts.append(f'<rect x="{off}" y="70" width="{w}" height="150" fill="{col}"/>')
            parts.append(f'<rect x="{200-off-w}" y="70" width="{w}" height="150" fill="{col}"/>')
    elif a == "shoulders":
        parts.append(f'<path d="M0 0 H200 V52 Q100 70 0 52 Z" fill="{ac[0]}"/>')
    elif a == "band":
        parts.append(f'<rect x="0" y="92" width="200" height="30" fill="{ac[0]}"/>')
    elif a == "chevrons":
        for dy in (0, 26, 52):
            parts.append(f'<path d="M44 {96+dy} L100 {124+dy} L156 {96+dy} L156 {108+dy} L100 {136+dy} L44 {108+dy} Z" fill="{ac[0]}"/>')
    collar = f'<path d="M70 12 Q100 34 130 12 L122 9 Q100 26 78 9 Z" fill="{kit["trim"]}"/>'
    cuffs = (f'<path d="M8 44 L22 86 L29 83.5 L15 41.5 Z" fill="{kit["trim"]}"/>'
             f'<path d="M192 44 L178 86 L171 83.5 L185 41.5 Z" fill="{kit["trim"]}"/>')
    return (f'<svg viewBox="0 0 200 220" width="{size}" height="{size*1.1:.0f}" role="img" aria-label="{slug} jersey">'
            f'<defs><clipPath id="{cid}"><path d="{SHIRT}"/></clipPath></defs>'
            f'<g clip-path="url(#{cid})">{"".join(parts)}</g>{collar}{cuffs}'
            f'<path d="{SHIRT}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2"/></svg>')

if __name__ == "__main__":
    teams = json.load(open(sys.argv[1]))
    names = {t["slug"]: t["name"] for t in teams}
    assert set(names) == set(K), set(names) ^ set(K)
    cards = []
    for t in teams:
        k = K[t["slug"]]
        tag = k["season"] + (" · jazzed" if k.get("jazz") else "")
        warn = " warn" if k["season"] == "traditional" or "check" in k["note"].lower() else ""
        cards.append(f'<figure class="card"><div class="art">{jersey_svg(t["slug"], k)}</div>'
                     f'<figcaption><b>{t["name"]}</b><span class="tag{warn}">{tag} · {k["pattern"]}{(" + " + k["accent"]) if k.get("accent") else ""}</span>'
                     f'<small>{k["note"]}</small></figcaption></figure>')
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kit Check</title><style>
:root{{--bg:#f4f2ee;--card:#fff;--ink:#16181d;--mute:#5d6470;--warn:#a34b00;--line:#e2ded6}}
@media (prefers-color-scheme:dark){{:root{{--bg:#121417;--card:#1c1f24;--ink:#eceae6;--mute:#9aa1ab;--warn:#ffb36b;--line:#2b2f36}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,-apple-system,sans-serif}}
header{{padding:24px 16px 8px;max-width:1100px;margin:auto}} h1{{margin:0 0 4px;font-size:22px}} header p{{margin:0;color:var(--mute)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:16px;max-width:1100px;margin:auto}}
.card{{margin:0;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}}
.art{{display:flex;justify-content:center}} figcaption{{display:flex;flex-direction:column;gap:3px}}
.tag{{font-size:12px;color:var(--mute)}} .tag.warn{{color:var(--warn)}} small{{color:var(--mute);font-size:12.5px}}
</style></head><body><header><h1>BBB Last Man Standing: kit check</h1>
<p>One jersey per club, drawn from teams.json. Orange tag = based on the traditional colours or worth checking. "Jazzed" = an accent added to liven up a plain shirt.</p></header>
<main class="grid">{''.join(cards)}</main></body></html>"""
    open(sys.argv[2], "w").write(html)
    out = []
    for t in teams:
        k = dict(K[t["slug"]]); k.setdefault("accent", None); k.setdefault("jazz", False)
        t = dict(t); t["kit"] = k; out.append(t)
    json.dump(out, open(sys.argv[3], "w"), indent=2, ensure_ascii=False)
    print("ok", len(out))
