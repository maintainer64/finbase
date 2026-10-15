#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <vVERSION> <output-directory> [os/arch ...]" >&2
  exit 1
fi

release_tag=$1
output_dir=$2
shift 2

if [[ ! "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
  echo "Expected a version tag, for example v1.5.0: $release_tag" >&2
  exit 1
fi

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  targets=(windows/amd64 windows/arm64 linux/amd64 linux/arm64 darwin/amd64 darwin/arm64)
fi

# Validate all targets before building or creating output files.
for target in "${targets[@]}"; do
  case "$target" in
    windows/amd64|windows/arm64|linux/amd64|linux/arm64|darwin/amd64|darwin/arm64) ;;
    *) echo "Unsupported release target: $target" >&2; exit 1 ;;
  esac
done

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)
build_dir=$(mktemp -d "$output_dir/.build.XXXXXX")
trap 'rm -f "$build_dir/finbase" "$build_dir/finbase.exe" "$build_dir/README.md"; rmdir "$build_dir"' EXIT
cp "$repo_root/backend/README.release.md" "$build_dir/README.md"

cd "$repo_root/backend"
for target in "${targets[@]}"; do
  target_os=${target%/*}
  target_arch=${target#*/}
  binary=finbase
  if [[ "$target_os" == windows ]]; then
    binary=finbase.exe
  fi

  echo "Building $target ($release_tag)"
  CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" \
    go build -trimpath -ldflags='-s -w' -o "$build_dir/$binary" .

  artifact="finbase-backend-$release_tag-$target_os-$target_arch"
  if [[ "$target_os" == windows ]]; then
    zip -j "$output_dir/$artifact.zip" "$build_dir/$binary" "$build_dir/README.md"
  else
    tar -czf "$output_dir/$artifact.tar.gz" -C "$build_dir" "$binary" README.md
  fi
done
