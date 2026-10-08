#!/usr/bin/env python3
"""build.py — сборка харнесса для сервера harness.autoiflow.com.

Что: (1) вшивает адаптив (responsive.css/.js) в МАСТЕР sketches/harness.html — один раз, по метке;
     (2) из мастера собирает серверную копию out/site/sketches/harness.html: пути карты (/map/, /map-data/),
         стартовый экран «Новый чат», переход по #s=<id>, вкладка Настройки · About с возрастом данных;
     (3) кладёт рядом design-system.html;
     (4) копирует набор скетчей sketches/disarto и собирает из него ПРОТОТИП ИЗ НОВЫХ ЭКРАНОВ (out/site/sketches/proto, режим proto.css/proto.js);
         корень сайта открывает его, прежний прототип остаётся по адресу /sketches/harness-classic.html.
Где: ~/Harnessy/ui/deploy/ → out/site/. Заливка: deploy.sh.
Зачем: правки эскиза делаются в мастере, серверная копия всегда выводится из него — ручных патчей больше нет.
"""
import re, shutil, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
MASTER = ROOT / "sketches" / "harness.html"
DS = ROOT / "sketches" / "design-system.html"
OUT = HERE / "out" / "site"
MARK = "АДАПТИВ (04.10.2026)"


def rep(t, old, new, n=1):
    c = t.count(old)
    assert c == n, f"ожидалось {n}, найдено {c}: {old[:70]!r}"
    return t.replace(old, new)


def embed_responsive(t):
    """Адаптив в мастер: CSS перед первым </style>, JS перед строкой с resize-слушателем."""
    if MARK in t:
        return t, False
    css = (HERE / "responsive.css").read_text(encoding="utf-8")
    js = (HERE / "responsive.js").read_text(encoding="utf-8")
    t = t.replace("</style>", css + "</style>", 1)
    t = rep(t, "  window.addEventListener('resize',fit);\n", "  window.addEventListener('resize',fit);\n" + js)
    # кнопка ☰ и фон выдвижной панели — в разметку
    t = rep(t, '    <div class="tl"><i></i><i></i><i></i></div>\n',
            '    <div class="tl"><i></i><i></i><i></i></div>\n    <button class="menu-btn" aria-label="Меню" title="Меню">☰</button>\n')
    t = rep(t, '  <div class="body">\n', '  <div class="drawer-bg"></div>\n  <div class="body">\n')
    # полотна (.cv) масштабируются при каждом показе экрана, не только по клику в боковой панели
    t = rep(t, "document.getElementById('ph').textContent=sc.ph;}", "document.getElementById('ph').textContent=sc.ph;requestAnimationFrame(fit);}")
    # viewport: разрешить масштаб (доступность), но стартовать 1:1
    t = re.sub(r'<meta name="viewport"[^>]*>', '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">', t, count=1)
    return t, True


ABOUT_SCREEN = '''
        <div class="screen" id="s-about">
          <div class="set" style="grid-template-columns:1fr">
            <div class="setc">
              <div class="sg"><h4>About · что это и где лежит</h4><div class="sgd"><b>Где:</b> NL99 (Нидерланды), папка <code>/harness</code>, адрес harness.autoiflow.com под паролем или входом через Telegram. <b>Что:</b> проектируемый харнесс — прототип 26 экранов в трёх обликах, дизайн‑система, живая карта OM. <b>Зачем:</b> смотреть и показывать с любого устройства, не с ноутбука; данные карты — выгрузка с машины владельца раз в 30 мин.</div>
                <div class="tbl"><div class="th"><span>Часть</span><span>Адрес</span><span>Откуда</span><span>Открыть</span></div>
                  <div class="tr"><span><b>Прототип</b> · этот экран</span><span>/ (старт — «Новый чат»)</span><span>REPORTS/workbench-design/sketches/harness.html</span><span><a href="/#s=new">↗</a></span></div>
                  <div class="tr"><span><b>Дизайн‑система</b></span><span>/sketches/design-system.html</span><span>…/sketches/design-system.html</span><span><a href="/sketches/design-system.html" target="_blank">↗</a></span></div>
                  <div class="tr"><span><b>Скетчи 01–19</b> · новый стиль</span><span>/sketches/disarto/</span><span>…/sketches/disarto · живые, с переходами</span><span><a href="/sketches/disarto/index.html" target="_blank">↗</a></span></div>
                  <div class="tr"><span><b>Карта OM</b> отдельно</span><span>/map/#/om-map</span><span>ASVP/UI/asvh-workbench · vite build</span><span><a href="/map/#/om-map" target="_blank">↗</a></span></div>
                  <div class="tr"><span><b>Данные карты</b></span><span>/map-data/</span><span>export-map.mjs · export-dev-timeline.mjs · launchd 30 мин</span><span><a href="/map-data/" target="_blank">↗</a></span></div>
                  <div class="tr"><span><b>Журнал входов</b></span><span>/auth/log</span><span>tg_auth.py · logins.ndjson</span><span><a href="/auth/log" target="_blank">↗</a></span></div></div>
                <div class="rcpt" id="aboutAge">выгрузка данных: …</div>
              </div>
              <div class="sg"><h4>Как попасть на нужный экран</h4><div class="sgd">Любой экран открывается прямой ссылкой <code>/#s=&lt;id&gt;</code>: <code>#s=new</code> новый чат · <code>#s=plan</code> план и карта · <code>#s=team</code> стая · <code>#s=prov</code> аккаунты и лимиты · <code>#s=set</code> настройки · <code>#s=about</code> эта вкладка. Облик переключается в правом верхнем углу (на телефоне — внизу боковой панели) и запоминается в браузере.</div></div>
              <div class="sg"><h4>Что здесь живое, а что нарисовано</h4><div class="sgd"><b>Живое:</b> карта OM (вкладка «План · карта» и /map/), счётчики прогресса и лестница — из выгрузки dev‑timeline/map.json. <b>Нарисовано:</b> разговоры, стая агентов, расход, настройки — содержимое сцен‑гипотез, цифры условные. Это эскиз для решений о продукте, не работающий харнесс; рабочий — HARNESS на :3777 у владельца.</div></div>
            </div>
          </div>
        </div>
'''


def server_variant(t):
    # карта и данные — с этого же сервера
    t = t.replace("http://localhost:3000/#/om-map?embed", "/map/#/om-map?embed")
    t = t.replace("http://localhost:3000/#/om-map", "/map/#/om-map")
    t = t.replace("localhost:3000", "harness.autoiflow.com/map")
    t = rep(t, "fetch('../data/dev-timeline.json')", "fetch('/map-data/dev-timeline.json',{cache:'no-store'})")
    t = rep(t, "fetch('../data/map.json')", "fetch('/map-data/map.json',{cache:'no-store'})")
    assert "localhost" not in t, "в серверной копии остался localhost"
    # стартовый экран «Новый чат», прямые ссылки #s=<id>
    t = rep(t, "  show('plan');\n",
            "  const hashScreen=()=>(location.hash.match(/^#s=([a-z0-9-]+)/)||[])[1];\n"
            "  show(hashScreen()||'new');\n"
            "  addEventListener('hashchange',()=>{ const s=hashScreen(); if(s && document.getElementById('s-'+s)) show(s); });\n")
    # вкладка About
    i = t.index('<div class="screen" id="s-set">')
    j = t.index("\n      </div>", i)
    t = t[:j] + "\n" + ABOUT_SCREEN.rstrip("\n") + t[j:]
    t = rep(t, "set:{title:'Настройки',tabs:[['Разделы','set'],['Память и правила','mem'],['Первый запуск','p-first']]},",
            "set:{title:'Настройки',tabs:[['Разделы','set'],['Память и правила','mem'],['Первый запуск','p-first'],['About','about']]},")
    t = rep(t, "    set:{where:'Настройки',next:'каждая настройка — с областью и квитанцией применения',ph:'Спросить про настройку…'},",
            "    set:{where:'Настройки',next:'каждая настройка — с областью и квитанцией применения',ph:'Спросить про настройку…'},\n"
            "    about:{where:'Настройки · About',next:'что здесь живое, где лежит, как открыть экран ссылкой',ph:'Спросить про прототип…'},")
    t = rep(t, "catch(e){ d=SNAP; m=SNAP; }",
            "catch(e){ d=SNAP; m=SNAP; }\n"
            "    try{ const at=new Date(d.meta.generatedAt), h=(Date.now()-at)/36e5; document.getElementById('aboutAge').textContent='выгрузка данных: '+at.toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК · '+(h>24?Math.round(h/24)+' дн. назад':Math.round(h)+' ч назад')+' · голова om/module '+d.meta.sources.omModuleHead.sha+' · задач '+d.tasks.length; }catch(e){}")
    return t


def md_to_html(md: str, title: str) -> str:
    """Очень простой Markdown → HTML (заголовки, таблицы, списки, **жирный**, `код`) — чтобы аудит открывался в браузере без правки nginx."""
    import html as H
    def inline(s):
        s = H.escape(s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        return re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    out, in_tbl, in_ul = [], False, False
    def close():
        nonlocal in_tbl, in_ul
        if in_tbl: out.append("</table>"); in_tbl = False
        if in_ul: out.append("</ul>"); in_ul = False
    for ln in md.splitlines():
        if ln.startswith("|"):
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            if all(set(c) <= set("-: ") for c in cells): continue
            if not in_tbl: close(); out.append("<table>"); in_tbl = True; tag = "th"
            else: tag = "td"
            out.append("<tr>" + "".join(f"<{tag}>{inline(c)}</{tag}>" for c in cells) + "</tr>")
            continue
        m = re.match(r"^(#{1,4})\s+(.*)", ln)
        if m: close(); n = len(m.group(1)); out.append(f"<h{n+1}>{inline(m.group(2))}</h{n+1}>"); continue
        if re.match(r"^\s*[-*]\s+", ln) or re.match(r"^\d+\.\s+", ln):
            if in_tbl: close()
            if not in_ul: out.append("<ul>"); in_ul = True
            out.append("<li>" + inline(re.sub(r"^\s*(?:[-*]|\d+\.)\s+", "", ln)) + "</li>"); continue
        close()
        if ln.strip(): out.append("<p>" + inline(ln) + "</p>")
    close()
    css = ("body{max-width:1100px;margin:0 auto;padding:32px 20px 60px}h2{font:600 22px var(--font);margin:0 0 14px}h3{font:500 17px var(--font);margin:28px 0 10px}h4,h5{font:500 14px var(--font);margin:20px 0 8px}"
           "p,li{font-size:13.5px;line-height:1.6;color:var(--ink2);margin:0 0 8px}b{color:var(--ink);font-weight:500}code{font:12px var(--mono);background:var(--raised);padding:1px 5px;border-radius:4px}"
           "table{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:12.5px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--ink2)}th{font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ink3)}a{color:var(--ink2)}")
    return ('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>'
            '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"><link rel="stylesheet" href="style.css"><style>' + css + '</style></head><body>'
            '<p><a href="index.html">← все скетчи</a></p>' + "\n".join(out) + '</body></html>')


def build_sketches():
    """Набор живых скетчей sketches/disarto → out/site/sketches/disarto (без резервных копий); аудит — отдельной HTML-страницей."""
    src = ROOT / "sketches" / "disarto"
    dst = OUT / "sketches" / "disarto"
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)
    n = 0
    for f in sorted(src.iterdir()):
        if f.is_file() and f.suffix in (".html", ".css", ".js") and "-before-" not in f.name:
            shutil.copy(f, dst / f.name); n += 1
    audit = ROOT / "synthesis" / "audit-unload-051026.md"
    if audit.exists():
        (dst / "audit.html").write_text(md_to_html(audit.read_text(encoding="utf-8"), "Аудит разгрузки экранов"), encoding="utf-8")
    idx = dst / "index.html"
    s = idx.read_text(encoding="utf-8")
    s = s.replace('<a href="../../evidence/threads-disarto.md">evidence/threads-disarto.md</a>', "референсов @disarto.digital")
    s = s.replace('href="../../synthesis/audit-unload-051026.md"', 'href="audit.html"')
    assert "../../" not in s, "в оглавлении остались ссылки за пределы сайта"
    idx.write_text(s, encoding="utf-8")
    print(f"скетчи: {n} файлов + audit.html → {dst}")


PROTO_PAGES = {"01-chat": "Чат", "02-plan": "План", "04-swarm": "Стая", "05-spend": "Расход", "06-settings": "Настройки", "09-events": "Плашки и события",
               "10-new-chat": "Новый чат", "11-connections": "Подключения", "12-research": "Ресёрч", "13-sensors": "Датчики", "14-now": "Сейчас",
               "15-artifacts": "Артефакты", "16-memory": "Память проекта", "17-doc": "Документ стадии", "18-overlays": "Уйти · окно · поиск",
               "19-first-run": "Первый запуск", "20-login-pour": "Вход", "21-journal": "Журнал"}
PROTO_START = "/sketches/proto/10-new-chat.html"
CLASSIC = "/sketches/harness-classic.html"
LAUNCH = ('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harnessy</title>'
          '<style>body{margin:0;background:#101012;color:#9a9aa2;font:14px Inter,system-ui,sans-serif;display:grid;place-items:center;height:100vh}a{color:#c27a34}</style></head>'
          '<body><p>Открываю Harnessy… <a href="%START%">перейти</a></p>'
          # старые прямые ссылки /#s=<экран> ведут в прежний прототип; всё остальное — в новый
          '<script>location.replace(/^#s=/.test(location.hash)?"%CLASSIC%"+location.hash:"%START%")</script></body></html>').replace("%START%", PROTO_START).replace("%CLASSIC%", CLASSIC)


def build_proto():
    """Прототип из новых экранов: копия скетчей в режиме прототипа (proto.css + proto.js) → out/site/sketches/proto.
    Исходники в sketches/disarto остаются листами с пояснениями; прототип всегда выводится из них."""
    src = ROOT / "sketches" / "disarto"
    dst = OUT / "sketches" / "proto"
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)
    for name in ("style.css", "app.js", "pour-scene.js"):
        shutil.copy(src / name, dst / name)
    app_js = (src / "app.js").read_text(encoding="utf-8")
    i = app_js.index("const IC={")
    ic = app_js[i:app_js.index("const TOP=", i)].rstrip()          # значки рейки — те же, что в скетчах
    shutil.copy(HERE / "proto.css", dst / "proto.css")
    shutil.copy(HERE / "live.js", dst / "live.js")                    # рабочий слой: состояние, решения, чат, поиск
    shutil.copy(HERE / "cx.js", dst / "cx.js")                        # поле ввода C′: папка · роль · режимы / ＋ · права · модель · усилие · ⓘ
    for extra in ("ctx.js", "set.js", "conn.js"):                      # модули экранов: контекст чата, настройки, подключения (08.10.2026)
        if (HERE / extra).exists():
            shutil.copy(HERE / extra, dst / extra)
    (dst / "proto.js").write_text(rep((HERE / "proto.js").read_text(encoding="utf-8"), "/*IC*/", ic), encoding="utf-8")
    for stem, title in PROTO_PAGES.items():
        t = (src / f"{stem}.html").read_text(encoding="utf-8")
        t = rep(t, '<html lang="ru">', '<html lang="ru" data-proto>')
        t = rep(t, "</head>", '<link rel="stylesheet" href="proto.css"></head>')
        t = rep(t, "</body>", '<script src="proto.js"></script>\n<script src="live.js"></script>\n<script src="cx.js"></script>\n<script src="ctx.js"></script>\n<script src="set.js"></script>\n<script src="conn.js"></script>\n</body>')
        t = re.sub(r"<title>.*?</title>", f"<title>Harnessy · {title}</title>", t, count=1, flags=re.S)
        (dst / f"{stem}.html").write_text(t, encoding="utf-8")
    (dst / "index.html").write_text(LAUNCH, encoding="utf-8")
    print(f"прототип из новых экранов: {len(PROTO_PAGES)} экранов → {dst}")


def stamp_assets(dst):
    """Версии к локальным скриптам и стилям (?v=хэш содержимого): после пересборки браузер и Electron берут новое, а не кэш (08.10.2026)."""
    import hashlib, re
    def ver(name):
        f = dst / name
        return hashlib.sha1(f.read_bytes()).hexdigest()[:8] if f.exists() else None
    n = 0
    for html in dst.glob("*.html"):
        t = html.read_text(encoding="utf-8")
        def sub(m):
            v = ver(m.group(2))
            return f'{m.group(1)}="{m.group(2)}?v={v}"' if v else m.group(0)
        t2 = re.sub(r'(src|href)="([a-zA-Z0-9_.-]+\.(?:js|css))"', sub, t)
        if t2 != t:
            html.write_text(t2, encoding="utf-8"); n += 1
    print(f"версии ресурсов проставлены: {n} страниц")


def main():
    t = MASTER.read_text(encoding="utf-8")
    t, changed = embed_responsive(t)
    if changed:
        MASTER.write_text(t, encoding="utf-8")
        print(f"мастер: адаптив вшит → {MASTER}")
    else:
        print("мастер: адаптив уже есть")
    (OUT / "sketches").mkdir(parents=True, exist_ok=True)
    # корень сайта (nginx отдаёт /sketches/harness.html) открывает новый прототип; прежний остаётся по своему адресу
    classic = server_variant(t).replace('href="/#s=', f'href="{CLASSIC}#s=')
    classic = classic.replace("<span><b>Прототип</b> · этот экран</span><span>/ (старт — «Новый чат»)</span>", f"<span><b>Прежний прототип</b> · этот экран</span><span>{CLASSIC}</span>")
    classic = classic.replace("<b>Скетчи 01–19</b> · новый стиль", "<b>Новый прототип и скетчи 00–20</b>").replace("<span>/sketches/disarto/</span>", "<span>/ · /sketches/disarto/</span>")
    (OUT / "sketches" / "harness-classic.html").write_text(classic, encoding="utf-8")
    (OUT / "sketches" / "harness.html").write_text(LAUNCH, encoding="utf-8")
    shutil.copy(DS, OUT / "sketches" / "design-system.html")
    print(f"прежний прототип: {OUT / 'sketches' / 'harness-classic.html'} ({(OUT / 'sketches' / 'harness-classic.html').stat().st_size} байт); корень → {PROTO_START}")
    build_sketches()
    build_proto()
    stamp_assets(OUT / "sketches" / "proto")


if __name__ == "__main__":
    main()
