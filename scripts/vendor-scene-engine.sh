#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: sh scripts/vendor-scene-engine.sh /path/to/engine-pixi-js" >&2
  exit 1
fi

project=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd -- "$1"
revision=$(git rev-parse HEAD)
if [ -n "$(git status --porcelain)" ]; then
  echo "Use a clean engine checkout so the generated file matches the recorded revision." >&2
  exit 1
fi

# esbuild 0.25.12 is only needed when updating the snapshot.
esbuild --bundle --format=esm --target=es2022 \
  --external:pixi.js \
  --banner:js="// Generated from lagatun54/engine-pixi-js@$revision by scripts/vendor-scene-engine.sh." \
  --outfile="$project/src/vendor/scene-engine.mjs" <<'EOF'
export { initEngineApplication } from './rendering/initEngineApplication.ts';
export { createSceneView } from './views/createSceneView.ts';
EOF
