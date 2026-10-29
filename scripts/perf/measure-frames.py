# Frame timing per interaction with the CPU throttled 4x (roughly a mid-range phone).
#   1. cd web && npx vite build          (measure the production build, not the dev server)
#   2. cd server && npm run dev          (serves web/dist on :8787 in demo mode; buy a plan or two first)
#   3. python3 scripts/perf/measure-frames.py <label> [base-url]
# Needs Python Playwright with Chromium. Headless Chromium has no GPU, so compositing costs are
# exaggerated; compare runs against each other, not against a phone.
import asyncio, json, sys
from playwright.async_api import async_playwright
LABEL = sys.argv[1] if len(sys.argv) > 1 else 'run'
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8787/'
LOGGER = """
window.__f=[]; window.__seg=null; window.__segs={};
(function loop(t){ if(window.__seg){ (window.__segs[window.__seg] ||= []).push(t);} requestAnimationFrame(loop); })(performance.now());
window.__start=(n)=>{window.__seg=n}; window.__stop=()=>{window.__seg=null};
"""
def stats(ts):
    d=[b-a for a,b in zip(ts,ts[1:])]
    if not d: return None
    d.sort(); n=len(d)
    return {'frames':n,'avg_fps':round(1000/(sum(d)/n),1),'p95_ms':round(d[int(n*0.95)-1],1),'max_ms':round(d[-1],1),'janky_%':round(100*sum(x>25 for x in d)/n,1)}
async def drag(pg,x0,y0,x1,y1,steps=24):
    await pg.mouse.move(x0,y0); await pg.mouse.down()
    for i in range(1,steps+1): await pg.mouse.move(x0+(x1-x0)*i/steps,y0+(y1-y0)*i/steps); await pg.wait_for_timeout(16)
    await pg.mouse.up()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--enable-gpu-rasterization'])
        ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2)
        pg = await ctx.new_page()
        await pg.route("**/*", lambda r: r.continue_() if "localhost" in r.request.url else r.abort())
        await pg.add_init_script(LOGGER)
        cdp = await ctx.new_cdp_session(pg)
        await pg.goto(BASE, wait_until="domcontentloaded")
        await pg.evaluate("localStorage.setItem('onboarded','1')"); await pg.reload(wait_until="domcontentloaded")
        await pg.wait_for_selector(".price .gram", timeout=30000); await pg.wait_for_timeout(2500)
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        async def seg(name, coro, settle=600):
            await pg.evaluate(f"__start('{name}')"); await coro; await pg.wait_for_timeout(settle); await pg.evaluate("__stop()")
        await seg('1 home idle', pg.wait_for_timeout(2500), 0)
        await seg('2 swipe plans', drag(pg,300,420,80,425), 900)
        await seg('3 term switch', pg.click('.terms button:nth-child(2)'), 900)
        await seg('4 pull to buy + sheet', drag(pg,195,380,195,560,20), 1200)
        await seg('5 sheet idle', pg.wait_for_timeout(2000), 0)
        await pg.keyboard.press('Escape'); await pg.mouse.click(195,100); await pg.wait_for_timeout(1200)
        await seg('6 open codes wallet', pg.click(".hdr-btn[aria-label='Your codes']"), 1400)
        await seg('7 lift wallet card', pg.mouse.click(195,170), 1400)
        first = await pg.evaluate("window.__segs")
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
        await pg.goto(BASE + "?intro=1", wait_until="domcontentloaded"); await pg.wait_for_timeout(2500)
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        await seg('8 onboarding', pg.wait_for_timeout(3500), 0)
        segs = {**first, **(await pg.evaluate("window.__segs"))}
        out = {k: stats(v) for k,v in sorted(segs.items())}
        
        print(f"{'segment':26} {'fps':>6} {'p95ms':>7} {'maxms':>7} {'janky%':>7}")
        for k,s in out.items():
            if s: print(f"{k:26} {s['avg_fps']:>6} {s['p95_ms']:>7} {s['max_ms']:>7} {s['janky_%']:>7}")
        await b.close()
asyncio.run(main())
