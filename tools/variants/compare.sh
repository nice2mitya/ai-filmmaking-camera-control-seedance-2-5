#!/bin/bash
# Лист сравнения пилл-клипов: строка на клип, 6 кадров: нырок 0.1/0.8/1.3/1.9 с, середина, конец.
#   tools/variants/compare.sh out.jpg clip1.mp4 clip2.mp4 ...
set -e
OUT="$1"; shift
TMP=$(mktemp -d)
i=0
for f in "$@"; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  name=$(basename "$f" .pill.mp4)
  j=0
  for t in 0.1 0.8 1.3 1.9 $(echo "$d/2" | bc -l) $(echo "$d-0.2" | bc -l); do
    ffmpeg -v error -y -ss "$t" -i "$f" -frames:v 1 -vf "scale=480:-2,drawtext=text='${name}  $(printf %.1f $t)s':x=8:y=8:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6" "$TMP/r${i}_${j}.png"
    j=$((j+1))
  done
  ffmpeg -v error -y $(for j in 0 1 2 3 4 5; do echo -i "$TMP/r${i}_${j}.png"; done) -filter_complex "hstack=inputs=6" "$TMP/row$i.png"
  i=$((i+1))
done
if [ "$i" -eq 1 ]; then ffmpeg -v error -y -i "$TMP/row0.png" -q:v 3 "$OUT"
else ffmpeg -v error -y $(for r in $(seq 0 $((i-1))); do echo -i "$TMP/row$r.png"; done) -filter_complex "vstack=inputs=$i" -q:v 3 "$OUT"; fi
rm -rf "$TMP"; echo "$OUT"
