# Layout check across phone sizes (iPhone SE / 17 / 17 Pro Max, small Android, Galaxy S24, Pixel 8,
# and iPhone 17 in Telegram full screen with its safe areas). For each: the gap between the plan card
# and the term picker at rest, whether the content below fades out while the card is pulled, and
# whether the review sheet fits. Screenshots go to /tmp. Usage (server serving web/dist on :8787):
#   python3 scripts/perf/check-layout.py [label] [base-url]
import asyncio, json, sys
from playwright.async_api import async_playwright
TAG = sys.argv[1] if len(sys.argv) > 1 else 'x'
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8787/'
DEV = [
  ('iPhone SE', 375, 667, 2, False), ('iPhone 17', 402, 874, 3, False), ('17 Pro Max', 440, 956, 3, False),
  ('Android small', 360, 640, 3, False), ('Galaxy S24', 360, 780, 3, False), ('Pixel 8', 412, 915, 2.6, False),
  ('iPhone 17 TG full', 402, 874, 3, True),
]
CHECK = """() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {t: b.top, b: b.bottom, l: b.left, r: b.right}; };
  const slots = [...document.querySelectorAll('.slot')];
  const front = slots.sort((a,b) => (+getComputedStyle(b).zIndex) - (+getComputedStyle(a).zIndex))[0];
  const card = front && front.querySelector('.card-wrap').getBoundingClientRect();
  return { card: card && {t: card.top, b: card.bottom}, terms: r('.terms'), price: r('.price'), hint: r('.pullhint'), vh: innerHeight };
}"""
async def main():
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, w, h, dpr, full in DEV:
            pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=dpr)
            await pg.route("**/*", lambda r: r.continue_() if "localhost" in r.request.url else r.abort())
            await pg.goto(BASE, wait_until="domcontentloaded")
            await pg.evaluate("localStorage.setItem('onboarded','1')")
            await pg.reload(wait_until="domcontentloaded")
            if full:
                await pg.evaluate("""() => { const s = document.documentElement.style; s.setProperty('--tg-safe-area-inset-top','59px'); s.setProperty('--tg-content-safe-area-inset-top','46px');
                  s.setProperty('--tg-safe-area-inset-bottom','34px'); document.documentElement.classList.add('tg-full'); document.body.classList.add('tg-full'); }""")
            await pg.wait_for_selector(".terms", timeout=30000); await pg.wait_for_timeout(2600)
            rest = await pg.evaluate(CHECK)
            fn = name.replace(' ', '_')
            await pg.screenshot(path=f"/tmp/tessera-layout-{TAG}-{fn}-rest.png", timeout=60000)
            c = rest['card']; await pg.mouse.move(w/2, (c['t']+c['b'])/2); await pg.mouse.down()
            await pg.mouse.move(w/2, (c['t']+c['b'])/2 + 100, steps=10); await pg.wait_for_timeout(250)
            mid = await pg.evaluate("() => getComputedStyle(document.querySelector('.below')||document.body).opacity")
            await pg.screenshot(path=f"/tmp/tessera-layout-{TAG}-{fn}-pull.png", timeout=60000)
            await pg.mouse.move(w/2, (c['t']+c['b'])/2 + 5, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(600)
            await pg.click('.pullhint button'); await pg.wait_for_timeout(1300)
            sheet = await pg.evaluate("() => { const s = document.querySelector('.sheet'); const b = s.getBoundingClientRect(); return {t: b.top, h: b.height, scroll: s.scrollHeight > s.clientHeight + 1}; }")
            await pg.screenshot(path=f"/tmp/tessera-layout-{TAG}-{fn}-sheet.png", timeout=60000)
            gap = rest['terms']['t'] - c['b'] if rest['terms'] else None
            res[name] = {'card_to_picker_gap': round(gap, 1), 'hint_bottom_vs_screen': round(rest['vh'] - rest['hint']['b'], 1),
                         'below_opacity_mid_pull': mid, 'card_h': round(c['b'] - c['t']), 'sheet_top': round(sheet['t']), 'sheet_scrolls': sheet['scroll']}
            await pg.close()
        await b.close()
    print(f"{'device':20} {'card h':>6} {'gap card→picker':>16} {'room below hint':>16} {'below opacity @pull':>20} {'sheet top':>9} {'sheet scrolls':>13}")
    for k, v in res.items():
        print(f"{k:20} {v['card_h']:>6} {v['card_to_picker_gap']:>16} {v['hint_bottom_vs_screen']:>16} {v['below_opacity_mid_pull']:>20} {v['sheet_top']:>9} {str(v['sheet_scrolls']):>13}")
asyncio.run(main())
