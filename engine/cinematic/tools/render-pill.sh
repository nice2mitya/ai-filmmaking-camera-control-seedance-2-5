#!/bin/sh
# Render one template as the pill clip that is sent to Seedance as the reference video:
# 24 fps, no sound, 21:9 (1280x534), the same conversion the published clips went through.
#   tools/render-pill.sh CAM06-Orbit [--standin capsule] [--vertical]   (--vertical: 9:16, 720x1280, <ID>.916.pill.mp4)
# Output: .work/out/pill/<ID>.pill.mp4 (override the folder with CAMERA_CONTROL_HOME).
set -e
cd "$(dirname "$0")/.."
ID="$1"; shift || true
[ -z "$ID" ] && { echo "usage: tools/render-pill.sh <TEMPLATE-ID> [--standin capsule|pin]"; exit 1; }
HOME_DIR="${CAMERA_CONTROL_HOME:-$PWD/.work}"
OUT="$HOME_DIR/out/pill"
mkdir -p "$OUT"
TAG=""; case " $* " in *" --standin capsule "*) TAG=".capsule";; esac   # the capsule never overwrites the pin clip
CROP="crop=1280:534"; EXTRA=""
case " $* " in *" --vertical "*) TAG="$TAG.916"; CROP="crop=720:1280"; EXTRA="--aspect 0.5625";; esac   # 9:16: same vertical angle, centre cut
ARGS=$(printf '%s\n' "$@" | grep -v '^--vertical$' | tr '\n' ' ')
node render.mjs --videos "$ID" --boxes --clean --subframes 5 --scale 0.6666666666666666 --concurrency 3 --out "$OUT" $EXTRA $ARGS
ffmpeg -v error -y -i "$OUT/$ID.mp4" -vf "$CROP" -r 24 -an -c:v libx264 -crf 18 -pix_fmt yuv420p "$OUT/$ID$TAG.pill.mp4"
echo "$OUT/$ID$TAG.pill.mp4"
echo "Keep every reference video under 29 s in total (trim a longer clip)."
