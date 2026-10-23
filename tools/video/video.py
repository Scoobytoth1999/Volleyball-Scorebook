from playwright.sync_api import sync_playwright
import pathlib, shutil, time
S=pathlib.Path('/home/claude/volleyball-scorebook/tools')
URL='file:///home/claude/volleyball-scorebook/retail/dist/Digital_Volleyball_Scorebook.html'
school='file://'+str(S/'listing/school-1.jpg'); club='file://'+str(S/'listing/club-1.jpg')
OVERLAY = r"""
(() => {
  const st = document.createElement('style');
  st.textContent = `
  #cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;background:rgba(18,28,48,.92);color:#fff;
       font:650 26px/1.25 Inter,Arial,sans-serif;padding:14px 26px;border-radius:14px;max-width:1100px;text-align:center;
       box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .25s;opacity:0;pointer-events:none}
  #cap b{color:#f2c14e}
  .rip{position:fixed;z-index:99998;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(242,193,78,.55);
       border:3px solid #f2c14e;pointer-events:none;animation:rp .55s ease-out forwards}
  @keyframes rp{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}
  #card{position:fixed;inset:0;z-index:100000;background:#1f3a6e;color:#fff;display:flex;flex-direction:column;justify-content:center;
        padding:0 110px;font-family:Inter,Arial,sans-serif;transition:opacity .4s}
  #card .k{color:#e0a91b;font-weight:750;letter-spacing:.16em;text-transform:uppercase;font-size:22px}
  #card h1{font-size:74px;font-weight:850;letter-spacing:-.02em;line-height:1;margin:16px 0}
  #card p{font-size:28px;color:#d7e0ee;max-width:900px;margin:0}
  #card .ring{position:absolute;right:-90px;top:-120px;width:380px;height:380px;border-radius:50%;border:40px solid #e0a91b}
  #sheets{position:fixed;inset:0;z-index:99990;background:#1f3a6e;display:flex;align-items:center;justify-content:center;gap:30px;padding:30px 40px 110px}
  #sheets img{max-height:540px;max-width:575px;width:auto;height:auto;background:#fff;border-radius:8px;box-shadow:0 16px 40px rgba(0,0,0,.35)}
  `;
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id='cap'; document.body.appendChild(c);
  document.addEventListener('pointerdown', e => { const r=document.createElement('div'); r.className='rip'; r.style.left=e.clientX+'px'; r.style.top=e.clientY+'px'; document.body.appendChild(r); setTimeout(()=>r.remove(),600); }, true);
  window.cap = (t) => { const el=document.getElementById('cap'); if(!t){el.style.opacity=0;return;} el.innerHTML=t; el.style.opacity=1; };
  window.card = (k,h,p) => { let el=document.getElementById('card'); if(!k){ if(el){el.style.opacity=0; setTimeout(()=>el.remove(),400);} return; }
    if(!el){el=document.createElement('div'); el.id='card'; document.body.appendChild(el);} el.style.opacity=1;
    el.innerHTML='<div class="ring"></div><div class="k">'+k+'</div><h1>'+h+'</h1><p>'+p+'</p>'; };
  window.sheets = (a,b) => { let el=document.getElementById('sheets'); if(!a){ if(el) el.remove(); return; }
    el=document.createElement('div'); el.id='sheets'; el.innerHTML='<img src="'+a+'"><img src="'+b+'">'; document.body.appendChild(el); };
})();
"""
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':720}, record_video_dir=str(S/'video'), record_video_size={'width':1280,'height':720}, accept_downloads=True)
    pg=ctx.new_page(); t0=time.time()
    pg.goto(URL); pg.evaluate(OVERLAY)
    W=pg.wait_for_timeout
    def cap(t): pg.evaluate('t=>cap(t)', t)
    def tap(sel, after=260): pg.click(sel); W(after)
    pg.evaluate("()=>card('For coaches and scorekeepers','Digital Volleyball Scorebook','Keep the official game book on a laptop. Print a finished scoresheet when the match ends.')")
    W(3800); pg.evaluate("()=>card()"); W(400)
    # setup
    tap('[data-act=new]', 400)
    cap('<b>Set up a match.</b> Pick the level and the rules fill themselves in.')
    pg.type('#f-home','Lincoln Lions', delay=45); pg.type('#f-away','Westview Hawks', delay=45)
    tap('[data-act=color][data-team=A][data-c=navy]'); tap('[data-act=color][data-team=B][data-c=gold]', 500)
    pg.select_option('#f-level','8th grade'); W(900)
    pg.locator('#f-format').scroll_into_view_if_needed(); W(1300)
    pg.evaluate('window.scrollTo(0,0)')
    tap('button[type=submit]', 500)
    # lineups
    cap('<b>Enter lineups where players stand</b>, using the on-screen keypad.')
    tap('[data-act=kp][data-team=A][data-k="0"]', 300)
    for n in ['4','11','7','15','2','9','3','12','8','21','5','10']:
        for ch in n: tap(f'#kp [data-key="{ch}"]', 110)
        tap('#kp [data-key=next]', 140)
    tap('[data-act=captain][data-team=A][data-num="7"]', 300); tap('[data-act=captain][data-team=B][data-num="21"]', 600)
    tap('button[type=submit]', 300)
    cap('<b>Lineup check</b> shows both rotations before the first serve.')
    W(2600); tap('[data-act=startset]', 400)
    # scoring
    cap('<b>Tap the team that won the rally.</b> Server, rotation, and side-outs update automatically.')
    for t in 'AABABAAABBA': tap(f'[data-act=point][data-team={t}]', 520)
    tap('[data-act=to][data-team=B]', 1200)
    cap('<b>Subs and timeouts are counted</b>, and illegal subs are blocked.')
    tap('[data-act=sub][data-team=A]', 600); tap('[data-act=subout][data-num="11"]', 400)
    tap('.keys.inline [data-key="1"]', 250); tap('.keys.inline [data-key="8"]', 600); tap('[data-act=dosub]', 1300)
    cap('<b>Fix mistakes anywhere.</b> Undo, or edit any rally in the game log.')
    tap('[data-act=log]', 900); tap('button.logrow >> nth=3', 1600); tap('[data-act=logcancel]', 300); tap('[data-act=close]', 600)
    cap('<b>Wrong player on the court?</b> Edit lineup fixes the sub that was entered wrong.')
    tap('[data-act=editlu]', 1100); tap('[data-act=elsel][data-team=A][data-k="1"]', 500)
    tap('.keys.inline [data-key="1"]', 250); tap('.keys.inline [data-key="6"]', 900); tap('[data-act=elsave]', 1800); tap('[data-act=close]', 500)
    cap('<b>Lineup turned the wrong way?</b> Rotate moves a team one spot without scoring.')
    tap('[data-act=rotate][data-team=B]', 900); tap('.rotm [data-act=rot][data-dir="1"]', 1100); tap('.rotm [data-act=rot][data-dir="-1"]', 900); tap('.rotm [data-act=close]', 500)
    cap('Yellow and red cards, penalty points, and replays live under <b>More</b>.')
    tap('[data-act=more]', 2200); tap('[data-act=close]', 400)
    cap('<b>Hide the log</b> for even bigger buttons.')
    tap('[data-act=togglelog]', 1300)
    for t in 'AAABA': tap(f'[data-act=point][data-team={t}]', 420)
    W(500)
    # sheets
    pg.evaluate('([a,b])=>sheets(a,b)', [school, club]); cap('<b>Print a finished scoresheet as a PDF.</b> School (NFHS rally) or club (USAV/AAU) style.')
    W(4200); pg.evaluate('()=>sheets()'); cap('')
    pg.evaluate("()=>card('Works offline · No accounts','Digital Volleyball Scorebook','Chrome or Edge on Windows, Mac, or Chromebook. Not for iPad. Includes an 8-page Quick-Start Guide.')")
    W(4200)
    print('elapsed', round(time.time()-t0,1))
    vpath=pg.video.path(); ctx.close(); b.close()
    shutil.move(vpath, str(S/'video/raw.webm'))
