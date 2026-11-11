#!/usr/bin/env node
// Апскейл готового ролика через fal. По умолчанию – ByteDance upscaler (fal-ai/bytedance-upscaler/upscale/video,
// preset aigc): это наш стандарт апскейла везде. --engine seedvr – SeedVR, только для сравнения.
//   node tools/fal/upscale.mjs <video.mp4> [--engine bytedance|seedvr] [--url https://...] [--res 1080p] [--go]
// Без --go – только показывает запрос и смету. Видео нужно по публичному URL: по умолчанию берётся
// content.video_url из <name>_result.json рядом с роликом (ссылка BytePlus живёт ~24 ч), иначе --url.
// Результат: <name>_seedvr<res>.mp4 рядом (существующий не перезаписывается, добавляется _vN),
// строка в $CAMERA_PROJECT_DIR/jobs.log. Цена – из API fal (за мегапиксель результата), не по памяти.
import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const ENGINE = opt("--engine", "bytedance");
const ENDPOINT = { bytedance: "fal-ai/bytedance-upscaler/upscale/video", seedvr: "fal-ai/seedvr/upscale/video" }[ENGINE];
if (!ENDPOINT) { console.error("Ошибка: --engine bytedance|seedvr"); process.exit(1); }
const die = (m) => { console.error("Ошибка: " + m); process.exit(1); };
const src = args.find((a) => !a.startsWith("--") && a.endsWith(".mp4"));
if (!src || !existsSync(src)) die("укажи локальный .mp4");
const res = opt("--res", "1080p");
const go = args.includes("--go");
const PROJECT = process.env.CAMERA_PROJECT_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// ключ из vault
const env = Object.fromEntries(readFileSync(path.join(process.env.HOME, ".config/genproducer/.env"), "utf8")
  .split("\n").filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }));
const KEY = env.FAL_KEY || env.FAL_API_KEY;
if (!KEY) die("нет FAL_KEY в ~/.config/genproducer/.env");
const H = { Authorization: `Key ${KEY}`, "Content-Type": "application/json" };

let url = opt("--url");
const base = src.replace(/\.mp4$/, "");
if (!url) { const r = `${base}_result.json`; if (existsSync(r)) url = JSON.parse(readFileSync(r, "utf8"))?.content?.video_url; }
if (!url) die("нет публичного URL: передай --url");

const probe = (f) => execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=width,height,nb_read_packets", "-of", "csv=p=0", f]).toString().trim().split(",").map(Number);
const [w, h, frames] = probe(src);
const fps = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", src]).toString().trim().split("/").reduce((a, b) => a / b));
const secs = frames / fps;
const short = { "720p": 720, "1080p": 1080, "1440p": 1440, "2160p": 2160, "2k": 1440, "4k": 2160 }[res];
const k = short / Math.min(w, h), outMP = (Math.round(w * k) * Math.round(h * k) * frames) / 1e6;
const price = (await (await fetch(`https://api.fal.ai/v1/models/pricing?endpoint_id=${ENDPOINT}`, { headers: H })).json()).prices?.[0];
if (!price || !["megapixels", "seconds"].includes(price.unit)) die(`неожиданная цена fal: ${JSON.stringify(price)}`);
const qty = price.unit === "seconds" ? secs : outMP;
const est = qty * price.unit_price;
console.log(`${ENDPOINT} | ${w}x${h} ${frames} кадров (${secs.toFixed(1)} с) → ${res} | ${qty.toFixed(1)} ${price.unit} × $${price.unit_price} ≈ $${est.toFixed(2)}`);
if (!go) { console.log("dry-run: добавь --go"); process.exit(0); }

let out = `${base}_${ENGINE}${res}.mp4`;
for (let v = 2; existsSync(out); v++) out = `${base}_${ENGINE}${res}_v${v}.mp4`;
const name = path.basename(out, ".mp4");
const log = (status, extra) => appendFileSync(path.join(PROJECT, "jobs.log"),
  [new Date().toISOString().slice(0, 19), "upscale", `fal/${ENDPOINT}`, name, extra.id ?? "", `status=${status}`, `${ENGINE} ${res} from ${path.basename(src)}`,
   `out=${status === "succeeded" ? path.relative(PROJECT, out) : "-"}`, `cost=${extra.cost ?? "?"}`, `cost_note=${extra.note ?? ""}`].join("\t") + "\n");

const sub = await (await fetch(`https://queue.fal.run/${ENDPOINT}`, { method: "POST", headers: H,
  body: JSON.stringify(ENGINE === "bytedance"
    ? { video_url: url, target_resolution: res, target_fps: Math.round(fps), enhancement_preset: "aigc", enhancement_tier: "standard", fidelity: "high" }
    : { video_url: url, upscale_mode: "target", target_resolution: res, output_quality: "high" }) })).json();
if (!sub.request_id) die(`fal не принял запрос: ${JSON.stringify(sub).slice(0, 300)}`);
console.log(`Задача: ${sub.request_id}`);
for (;;) {
  await new Promise((r) => setTimeout(r, 10000));
  let st; try { st = await (await fetch(sub.status_url, { headers: H })).json(); } catch { continue; }   // сеть моргнула – ждём дальше, не пересабмитим
  console.log(`   Статус: ${st.status}`);
  if (st.status === "COMPLETED") break;
  if (!["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) { log("failed", { id: sub.request_id, cost: 0, note: JSON.stringify(st).slice(0, 200) }); die(JSON.stringify(st)); }
}
const r = await (await fetch(sub.response_url, { headers: H })).json();
const vurl = r?.video?.url; if (!vurl) die(`нет видео в ответе: ${JSON.stringify(r).slice(0, 300)}`);
writeFileSync(out, Buffer.from(await (await fetch(vurl)).arrayBuffer()));
const [W, Hh, F] = probe(out), mp = (W * Hh * F) / 1e6, billed = price.unit === "seconds" ? (r.duration ?? secs) : mp;
log("succeeded", { id: sub.request_id, cost: (billed * price.unit_price).toFixed(2), note: `${billed.toFixed(1)} ${price.unit} x $${price.unit_price} (fal pricing API, not from bill)` });
console.log(`   ✓ ${out} (${W}x${Hh}, ${F} кадров)`);
