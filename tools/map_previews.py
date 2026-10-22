"""Vorschaubilder der Karten für die Kartenauswahl (public/assets/maps/*.png).
Aufruf: erst 'npm run dev' starten, dann  python3 tools/map_previews.py   (braucht playwright + pillow)"""
import time
from playwright.sync_api import sync_playwright
from PIL import Image
maps=['donau','alpen','ebene','revier','wueste','schnee']
C={'donau':(40,36),'alpen':(110,20),'ebene':(78,44),'revier':(70,46),'wueste':(184,36),'schnee':(48,44)}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width':1600,'height':900})
    pg.goto('http://localhost:5173/'); time.sleep(3)
    for m in maps:
        pg.evaluate(f"()=>{{localStorage.clear(); sessionStorage.setItem('rm_new','1'); sessionStorage.setItem('rm_map','{m}');}}")
        pg.reload(); time.sleep(7)
        pg.add_style_tag(content="body > *:not(#game){display:none !important}")
        pg.evaluate(f"()=>{{window.__c=[{C[m][0]},{C[m][1]}]}}")
        pg.evaluate("""()=>{const g=window.rm.game; g.grid.owned.fill(true); g.version++; g.paused=true; window.rm.ui.menu=true;
          window.rm.scene.hint = []; g.missionIdx = 9999;
          const [x,y]=window.__c;
          const sc=window.rm.scene; sc.cameras.main.setZoom(0.8); sc.cameras.main.centerOn((x*16+8)-(y*16+8), ((x*16+8)+(y*16+8))/2);}""")
        time.sleep(2)
        pg.screenshot(path=f'/tmp/prev_{m}.png', clip={'x':350,'y':285,'width':900,'height':330})
        Image.open(f'/tmp/prev_{m}.png').convert('RGB').resize((300,110), Image.BOX).save(f'public/assets/maps/{m}.png', optimize=True)
    b.close()
