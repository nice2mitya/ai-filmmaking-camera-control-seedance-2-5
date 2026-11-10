#!/usr/bin/env node
/**
 * Шаблон камеры → Seedance 2.5 через НАШ BytePlus ModelArk (вместо Tein).
 *
 * Обёртка над ~/.claude/skills/seedance/scripts/seedance.mjs:
 *   - читает templates/<ID>/sent.json (маршрут, порядок рефов, ratio, duration);
 *   - берёт промпт из templates/<ID>/prompts/ и переводит теги
 *     @video1 / @image1 / @audio1  →  [video 1] / [image 1] / [audio 1] (синтаксис BytePlus);
 *   - раскладывает рефы в том же порядке (пилл-клип, фото, скетч-лист, голос);
 *   - по умолчанию ТОЛЬКО dry-run: печатает запрос, денег не тратит;
 *   - --go отправляет 480p-ДРАФТ; --final <DRAFT_TASK_ID> делает чистовик 1080p;
 *   - результаты и jobs.log пишет в папку проекта (родитель репо), не в git.
 *
 * Примеры:
 *   node tools/byteplus/send.mjs CAM06-Orbit --photo ~/me.jpg                 # dry-run
 *   node tools/byteplus/send.mjs CAM06-Orbit --photo ~/me.jpg --go            # драфт 480p
 *   node tools/byteplus/send.mjs CAM06-Orbit --final cgt-2026...              # чистовик 1080p
 *   node tools/byteplus/send.mjs CAM06-Orbit --route ink-sketch --photo me.jpg
 *   node tools/byteplus/send.mjs --list CAM06-Orbit                           # маршруты и рефы
 *
 * Флаги:
 *   --route <name>       маршрут из sent.json (default: video)
 *   --photo <file|url>   фото человека для рефа «person photo»
 *   --pill <file|url>    свой пилл-клип (default: .work/out/pill/<ID>*.mp4, иначе templates/<ID>/pill.mp4)
 *   --sheet <file|url>   свой скетч-лист (default: templates/<ID>/sketch-sheet.jpg)
 *   --voice <file|url>   голосовой клип для рефа audio
 *   --product <file|url> фото продукта (PRD-шаблоны)
 *   --env <file|url>     своя картинка места вместо панели из environments/
 *   --source <file|url>  хвост прошлого тейка (шаблоны-продолжения)
 *   --prompt <file>      свой промпт вместо шаблонного (теги @video1 и т.п. тоже переведутся)
 *   --ratio / --duration переопределить параметры из sent.json
 *   --no-audio           без звука
 *   --name <base>        базовое имя файлов (default: <ID>_<route>)
 *   --go                 реально отправить (платно)
 *
 * Env: CAMERA_PROJECT_DIR (куда класть generated/ и jobs.log; default – папка над репо),
 *      SEEDANCE_USD_PER_MTOK (ставка для оценки cost, default 6.4 – публичная цена, не из счёта).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, mkdirSync, statSync } from "fs";
import { resolve, dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { homedir } from "os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const PROJECT = resolve(process.env.CAMERA_PROJECT_DIR || resolve(REPO, ".."));
const SEEDANCE = resolve(homedir(), ".claude/skills/seedance/scripts/seedance.mjs");
const USD_PER_MTOK = parseFloat(process.env.SEEDANCE_USD_PER_MTOK || "6.4");
const MODEL_ID = "dreamina-seedance-2-5-260628";

const args = process.argv.slice(2);
const one = (f) => { const i = args.indexOf(f); return i !== -1 && args[i + 1] ? args[i + 1] : null; };
const has = (f) => args.includes(f);
const die = (m) => { console.error(`\nОшибка: ${m}`); process.exit(1); };
const isUrl = (s) => /^https?:\/\//i.test(s);
const expand = (p) => (p && p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const local = (p) => (isUrl(p) ? p : resolve(process.cwd(), expand(p)));

const flagsWithValue = new Set(["--route", "--photo", "--product", "--env", "--source", "--pill", "--sheet", "--voice", "--prompt", "--ratio", "--duration", "--name", "--final", "--list"]);
const positional = args.filter((a, i) => !a.startsWith("--") && !flagsWithValue.has(args[i - 1]));
const ID = one("--list") || positional[0];
if (!ID) die("укажи ID шаблона, например CAM06-Orbit (список: templates/INDEX.md)");

const tdir = resolve(REPO, "templates", ID);
if (!existsSync(tdir)) die(`нет шаблона ${tdir}`);
const sent = JSON.parse(readFileSync(resolve(tdir, "sent.json"), "utf-8"));
const routes = sent.routes || {};

if (has("--list")) {
  for (const [name, r] of Object.entries(routes)) {
    const s = (r.sends || []).at(-1);
    if (!s) { console.log(`${name}: (нет отправок)`); continue; }
    const p = s.parameters?.sent_as || {};
    console.log(`${name}: ${s.prompt?.file}  ${p.duration}s ${p.aspect_ratio}`);
    for (const ref of s.references_in_send_order || []) console.log(`   ${ref.tag_in_prompt}  ${ref.kind}  ${ref.role}`);
  }
  process.exit(0);
}

const outDir = resolve(PROJECT, "generated", ID);
mkdirSync(outDir, { recursive: true });
const finalId = one("--final");

// ── учёт ──────────────────────────────────────────────────────────────────
function nextName(base) {
  const taken = new Set(existsSync(outDir) ? readdirSync(outDir) : []);
  if (![...taken].some((f) => f.startsWith(`${base}_task.json`) || f === `${base}.mp4`)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}_v${n}_task.json`) && !taken.has(`${base}_v${n}.mp4`)) return `${base}_v${n}`;
}
function logJob({ stage, name, promptRef, note }) {
  const read = (f) => { try { return JSON.parse(readFileSync(resolve(outDir, f), "utf-8")); } catch { return null; } };
  const task = read(`${name}_task.json`);
  const result = read(`${name}_result.json`);
  const tokens = result?.usage?.total_tokens ?? result?.usage?.completion_tokens;
  const status = result?.status || (task ? "submitted" : "not_sent");
  const cost = tokens != null ? (tokens * USD_PER_MTOK / 1e6).toFixed(2) : (status === "failed" ? "0" : "?");
  const mp4 = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.startsWith(name) && f.endsWith(".mp4")).sort().at(-1) : null;
  const line = [
    new Date().toISOString().slice(0, 19),
    `camera-${stage}`,
    `byteplus/${MODEL_ID}`,
    name,
    `taskId=${task?.taskId || "-"}`,
    `status=${status}`,
    note,
    `out=${mp4 ? `generated/${ID}/${mp4}` : "-"}`,
    `cost=${cost}`,
    tokens != null ? `cost_note=${tokens} tokens x $${USD_PER_MTOK}/M (public price, not from bill)` : "cost_note=tokens unknown",
    `prompt=${promptRef}`,
  ].join("\t");
  appendFileSync(resolve(PROJECT, "jobs.log"), line + "\n");
  console.log(`\njobs.log ← ${line}`);
}
function run(sdArgs) {
  console.log(`\n$ node seedance.mjs ${sdArgs.map((a) => (a.length > 80 ? a.slice(0, 77) + "…" : a)).join(" ")}\n`);
  const r = spawnSync("node", [SEEDANCE, ...sdArgs], { stdio: "inherit", cwd: PROJECT });
  return r.status;
}

// ── чистовик из драфта ──────────────────────────────────────────────────────
if (finalId) {
  if (!has("--go")) { console.log(`dry-run: чистовик 1080p из драфта ${finalId}. Добавь --go, чтобы отправить (платно).`); process.exit(0); }
  const name = nextName(`${one("--name") || ID}_final`);
  const code = run(["--final", finalId, "--name", name, "--out-dir", outDir, "--wait"]);
  logJob({ stage: "final", name, promptRef: `draft ${finalId}`, note: "FINAL 1080p из драфта" });
  process.exit(code ?? 1);
}

// ── драфт ───────────────────────────────────────────────────────────────────
const routeName = one("--route") || "video";
const route = routes[routeName];
if (!route) die(`маршрута «${routeName}» нет. Есть: ${Object.keys(routes).join(", ")}`);
const send = (route.sends || []).at(-1);
if (!send) die(`у маршрута «${routeName}» нет отправок`);

const promptFile = one("--prompt") ? local(one("--prompt")) : resolve(tdir, send.prompt.file);
let prompt = readFileSync(promptFile, "utf-8");
prompt = prompt.replace(/@(video|image|audio)(\d+)/gi, (_, k, n) => `[${k.toLowerCase()} ${n}]`);

function findPill() {
  if (one("--pill")) return local(one("--pill"));
  const pd = resolve(REPO, "engine/cinematic/.work/out/pill");
  if (existsSync(pd)) {
    const hit = readdirSync(pd).filter((f) => f.startsWith(ID) && f.endsWith(".mp4"))
      .map((f) => resolve(pd, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    if (hit) return hit;
  }
  const g = resolve(tdir, "pill.mp4");
  if (existsSync(g)) { console.warn("⚠ беру галерейную копию templates/<ID>/pill.mp4 (уменьшенная). Полный клип: engine/cinematic/tools/render-pill.sh " + ID); return g; }
  die("нет пилл-клипа: отрендерь engine/cinematic/tools/render-pill.sh " + ID + " или дай --pill");
}

// env-17-panel1.png → панель 1 листа 2×2 environments/17-*.png (1 – верх-лево, 2 – верх-право, 3 – низ-лево, 4 – низ-право).
// «whole environment contact sheet» → весь лист.
function envPanel(fileName, role) {
  const m = (fileName || "").match(/env-(\d+)(?:-panel(\d))?/);
  if (!m) die(`не понял environment-реф «${fileName}», дай --env`);
  const sheet = readdirSync(resolve(REPO, "environments")).find((f) => f.startsWith(m[1] + "-") && f.endsWith(".png"));
  if (!sheet) die(`нет environments/${m[1]}-*.png, дай --env`);
  const src = resolve(REPO, "environments", sheet);
  if (!m[2] || role.includes("whole")) return src;
  const out = resolve(outDir, `env-${m[1]}-panel${m[2]}.png`);
  if (!existsSync(out)) {
    const k = Number(m[2]) - 1, x = k % 2 ? "iw/2" : "0", y = k >= 2 ? "ih/2" : "0";
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", `crop=iw/2:ih/2:${x}:${y}`, out]);
    if (r.status !== 0) die(`ffmpeg не вырезал панель: ${r.stderr}`);
  }
  return out;
}

const refs = [...(send.references_in_send_order || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const counters = { video: 0, image: 0, audio: 0 };
const sdArgs = [];
for (const ref of refs) {
  const kind = ref.kind;
  const tag = (ref.tag_in_prompt || "").match(/@(video|image|audio)(\d+)/i);
  counters[kind] = (counters[kind] || 0) + 1;
  if (tag && Number(tag[2]) !== counters[kind]) console.warn(`⚠ порядок рефов: ${ref.tag_in_prompt} идёт ${counters[kind]}-м среди ${kind}`);
  const role = (ref.role || "").toLowerCase();
  let file;
  if (kind === "video" && (role.includes("pill") || role.includes("blockout"))) file = findPill();
  else if (kind === "video" && role.includes("continuation")) {
    file = one("--source") ? local(one("--source")) : die("нужно --source: хвост прошлого тейка для продолжения. Реф: " + ref.role);
  } else if (kind === "image" && (role.includes("person") || role.includes("face"))) {
    file = one("--photo") ? local(one("--photo")) : die("нужно --photo: фото человека (своё или с согласия). Реф: " + ref.role);
  } else if (kind === "image" && role.includes("product")) {
    file = one("--product") ? local(one("--product")) : die("нужно --product: фото продукта. Реф: " + ref.role);
  } else if (kind === "image" && role.includes("environment")) {
    file = one("--env") ? local(one("--env")) : envPanel(ref.file, role);
  } else if (kind === "image" && role.includes("sheet")) {
    file = one("--sheet") ? local(one("--sheet")) : resolve(tdir, "sketch-sheet.jpg");
    if (!isUrl(file) && !existsSync(file)) die(`нет скетч-листа ${file}, дай --sheet`);
  } else if (kind === "audio") {
    file = one("--voice") ? local(one("--voice")) : die("нужно --voice: голосовой клип. Реф: " + ref.role);
  } else die(`не знаю, чем заполнить реф ${ref.tag_in_prompt} (${kind}, ${ref.role})`);
  if (!isUrl(file) && !existsSync(file)) die(`нет файла ${file}`);
  sdArgs.push(`--ref-${kind}`, file);
  console.log(`[${kind} ${counters[kind]}] ← ${ref.role}: ${file}`);
}

const p = send.parameters?.sent_as || {};
const ratio = one("--ratio") || p.aspect_ratio || p.ratio || "16:9";
const duration = one("--duration") || String(p.duration ?? 5);
const name = nextName(`${one("--name") || `${ID}_${routeName}`}_draft`);
writeFileSync(resolve(outDir, `${name}_prompt.txt`), prompt);

const base = ["--model", "2.5", "--draft", "--ratio", ratio, "--duration", duration, "--name", name, "--out-dir", outDir, "--no-auto-res"];
if (has("--no-audio")) base.push("--no-audio");
const all = [prompt, ...base, ...sdArgs];

const leftTags = prompt.match(/@(video|image|audio)\d+/gi);
if (leftTags) console.warn(`⚠ в промпте остались теги: ${leftTags.join(", ")}`);
const usedTags = new Set((prompt.match(/\[(video|image|audio) \d+\]/g) || []));
for (const k of Object.keys(counters)) for (let n = counters[k] + 1; n <= 30; n++)
  if (usedTags.has(`[${k} ${n}]`)) console.warn(`⚠ промпт ссылается на [${k} ${n}], а такого рефа нет`);

if (has("--plan")) { console.log(`plan: ${ID}/${routeName} ${duration}s ${ratio}, рефов ${refs.length}`); process.exit(0); }
if (!has("--go")) {
  run([...all, "--dry-run"]);
  console.log(`\nЭто dry-run, ничего не отправлено. Драфт 480p, ${duration}s, ${ratio}. Промпт: ${resolve(outDir, name + "_prompt.txt")}`);
  console.log("Отправить (платно): добавь --go");
  process.exit(0);
}
const code = run([...all, "--wait"]);
logJob({ stage: "draft", name, promptRef: `generated/${ID}/${name}_prompt.txt`, note: `DRAFT 480p ${duration}s ${ratio} route=${routeName}` });
process.exit(code ?? 1);
