# Seedance через наш BytePlus (форк, вместо Tein)

В этом форке видео генерируется не через Tein, а через наш прямой доступ к Seedance 2.5 на BytePlus ModelArk – скилл `seedance` (`~/.claude/skills/seedance/scripts/seedance.mjs`, ключ `ARK_API_KEY` из vault). Tein-ключ не нужен.

`send.mjs` берёт шаблон, читает `templates/<ID>/sent.json` и собирает запрос:

- промпт из `templates/<ID>/prompts/`, теги `@video1` / `@image1` / `@audio1` переводятся в `[video 1]` / `[image 1]` / `[audio 1]`;
- рефы в том же порядке, что в оригинальной отправке: пилл-клип, фото, скетч-лист, панель места, голос;
- ratio и длительность из `sent.json`;
- всегда драфт 480p на `dreamina-seedance-2-5-260628`, чистовик 1080p – отдельной командой из id драфта.

## Команды

```bash
# какие маршруты и рефы есть у шаблона
node tools/byteplus/send.mjs --list CAM06-Orbit

# пилл-клип в полном размере (по умолчанию берётся уменьшенная галерейная копия)
cd engine/cinematic && npm install && tools/render-pill.sh CAM06-Orbit && cd ../..

# dry-run: показать запрос, ничего не отправлять (по умолчанию)
node tools/byteplus/send.mjs CAM06-Orbit --photo ~/photo.jpg

# драфт 480p – платно
node tools/byteplus/send.mjs CAM06-Orbit --photo ~/photo.jpg --go

# чистовик 1080p из драфта – платно
node tools/byteplus/send.mjs CAM06-Orbit --final <DRAFT_TASK_ID> --go
```

Маршрут выбирается `--route` (`video`, `camera-only-video`, `ink-sketch` и т.д.). Чего нет в репо, подаётся флагом: `--photo`, `--product`, `--voice`, `--source`; свои `--pill`, `--sheet`, `--env`, `--prompt` заменяют шаблонные. Панели `env-NN-panelK.png` вырезаются автоматически из листов `environments/`.

## Куда пишется

Результаты – в `../generated/<ID>/` (папка проекта над репо, не в git), строка на каждую отправку – в `../jobs.log` со стоимостью по токенам (`tokens × $6.4/M`, публичная цена, не из счёта). Переопределяется `CAMERA_PROJECT_DIR` и `SEEDANCE_USD_PER_MTOK`.

## Отличия от Tein

- Нет `pass_faces`. BytePlus может отклонить реалистичное фото живого человека (`real person`) – тогда лицо стилизовать или брать сгенерированного персонажа.
- Ссылки на рефы в промпте – `[video 1]`, а не `@video1`; скрипт переводит сам.
- Драфт – `draft: true` + 480p, чистовик – по `draft_task_id` (живёт 7 дней), тот же seed и композиция.
- Видео-рефы заливаются на наш S3/CDN, картинки идут base64.
