#!/usr/bin/env python3
"""Варианты PRD06-Glambot: меняют только константы траектории, остальное как в оригинале.
Пишет src/templates/products/p06<x>-glambot-<name>.ts, регистрирует в products/index.ts,
создаёт templates/<ID>/ (sent.json + prompts) для tools/byteplus/send.mjs.
    python3 tools/variants/glambot.py
"""
import json, pathlib, re, shutil

REPO = pathlib.Path(__file__).resolve().parents[2]
SRC = REPO / "engine/cinematic/src/templates/products"
BASE = (SRC / "p06-glambot.ts").read_text()

VARIANTS = [
    # suffix, id-name, title, what changes, replacements {pattern: new}
    ("b", "Mirror", "Glambot mirror", "Облёт в обратную сторону: дуга уходит влево от камеры.",
     {"AZ0 = -23.5, AZ1 = 23.5": "AZ0 = 23.5, AZ1 = -23.5"}),
    ("c", "Low", "Glambot low", "Старт ниже и дальше (3.2 м вверх, 3.8 м от звезды): нырок пологий, больше пространства дорожки.",
     {"R0 = 2.8,": "R0 = 3.8,", "H0 = 5.5,": "H0 = 3.2,"}),
    ("d", "CloseUp", "Glambot close-up", "Финал крупнее: камера доезжает до 0.85 м, план по плечи и лицо.",
     {"R8 = 1.32;": "R8 = 0.85;", "H8 = 1.59;": "H8 = 1.63;"}),
    ("e", "Short", "Glambot short", "8 с вместо 15: нырок тот же, слоумо-облёт короче. Дешевле в Seedance (входные секунды тоже в счёте).",
     {"SLOW = 0.08, END = 15;": "SLOW = 0.08, END = 8;"}),
    ("f", "WideArc", "Glambot wide arc", "Облёт 90° вместо 47°. Занавес, дорожка и ограждение расширены, чтобы 20 мм не выходил за край декорации (при 120° выходил).",
     {"AZ0 = -23.5, AZ1 = 23.5": "AZ0 = -45, AZ1 = 45",
      "curtain(46, 9)": "curtain(260, 9)",
      "BoxGeometry(32, CARPET_Y": "BoxGeometry(160, CARPET_Y",
      "i < 19; i++) { const x = -13.6": "i < 99; i++) { const x = -78.4"}),
]

# общие правки: поворот звезды считается от дуги и длины ролика, а не константами под 47°/15 с
COMMON = {
    "YAW0 = YAW1 - 50 * RAD;": "YAW0 = (AZ0 - 3) * RAD;",
    "const TURN = { t0: 0.9, dur: 1.8 };": "const TURN = { t0: 0.9, dur: W_END - 0.96 };",
}

def sub(text, pat, new):
    assert pat in text, f"нет «{pat}» в p06-glambot.ts"
    return text.replace(pat, new)

index = SRC / "index.ts"
idx = index.read_text()
tpl0 = REPO / "templates/PRD06-Glambot"
for suf, nm, title, what, reps in VARIANTS:
    vid = f"PRD06{suf}-Glambot{nm}"
    t = BASE
    for p, n in {**COMMON, **reps}.items():
        t = sub(t, p, n)
    t = sub(t, 'id: "PRD06-Glambot", name: "Glambot"', f'id: "{vid}", name: "{title}"')
    t = f"// {vid}: вариант PRD06-Glambot (tools/variants/glambot.py). {what}\n" + t
    fname = f"p06{suf}-glambot-{nm.lower()}"
    (SRC / f"{fname}.ts").write_text(t)
    imp = f'import {{ PIECE as P06{suf.upper()} }} from "./{fname}";'
    if imp not in idx:
        idx = idx.replace('import { PIECE as P06 } from "./p06-glambot";', 'import { PIECE as P06 } from "./p06-glambot";\n' + imp)
        idx = re.sub(r"(PRODUCT_TEMPLATES: Piece\[\] = \[[^\]]*)\]", rf"\1, P06{suf.upper()}]", idx)
    # папка шаблона для send.mjs
    dst = REPO / "templates" / vid
    (dst / "prompts").mkdir(parents=True, exist_ok=True)
    for f in (tpl0 / "prompts").iterdir():
        shutil.copy(f, dst / "prompts" / f.name)
    sent = json.loads((tpl0 / "sent.json").read_text())
    sent["id"] = vid
    sent["variant_of"] = "PRD06-Glambot"
    sent["variant_note"] = what + " Промпты скопированы из PRD06-Glambot: описание движения в них – под оригинал, перед отправкой поправить."
    end = 8 if suf == "e" else 15
    for r in sent["routes"].values():
        for s in r.get("sends") or []:
            s["parameters"]["sent_as"]["duration"] = end
            s.pop("output", None); s.pop("receipt", None)
    (dst / "sent.json").write_text(json.dumps(sent, ensure_ascii=False, indent=1))
    (dst / "README.md").write_text(f"# {vid}\n\nВариант [PRD06-Glambot](../PRD06-Glambot/). {what}\n\nКод: `engine/cinematic/src/templates/products/{fname}.ts` (генерится `tools/variants/glambot.py`).\nРендер: `cd engine/cinematic && tools/render-pill.sh {vid}`.\n")
    print(vid)
index.write_text(idx)
