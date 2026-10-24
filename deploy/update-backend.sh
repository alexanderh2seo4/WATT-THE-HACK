#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
export GIT_TERMINAL_PROMPT=0
root="$HOME/apps/watt-the-hack"
checkout="$root/repo"
mkdir -p "$root"
exec 9>"$root/update.lock"
flock -n 9 || exit 0

if [[ ! -d "$checkout/.git" ]]; then
  git clone --depth=1 --filter=blob:none --sparse --single-branch --branch main \
    https://github.com/alexanderh2seo4/WATT-THE-HACK.git "$checkout"
  git -C "$checkout" sparse-checkout set backend resources deploy
fi

cd "$checkout"
# Never discard changes made directly on the server.
git diff --quiet && git diff --cached --quiet || {
  echo 'Server checkout has local changes; refusing to overwrite them.' >&2
  exit 1
}
git fetch origin main
git merge --ff-only origin/main
revision="$(git rev-parse HEAD)"
previous="$(cat "$root/deployed-revision" 2>/dev/null || true)"

if [[ "$previous" == "$revision" ]] && systemctl --user is-active --quiet watt-the-hack; then
  echo "Backend is up to date: $revision"
  exit 0
fi

# Documentation/frontend-only pushes must not reset visitor simulations.
if [[ -n "$previous" ]] && systemctl --user is-active --quiet watt-the-hack \
  && git diff --quiet "$previous" "$revision" -- backend resources \
    deploy/update-backend.sh 'deploy/*.service' 'deploy/*.timer'; then
  printf '%s\n' "$revision" > "$root/deployed-revision"
  echo "No backend changes in $revision; keeping visitor simulations running."
  exit 0
fi

cd backend
uv sync --locked
uv run pytest tests/test_smoke.py::test_static_loads tests/test_smoke.py::test_drones_move_after_start tests/test_smoke.py::test_play_requires_reports tests/test_sessions.py -q

units="$HOME/.config/systemd/user"
mkdir -p "$units"
for unit in watt-the-hack.service watt-the-hack-update.service watt-the-hack-update.timer; do
  install -m 644 "$checkout/deploy/$unit" "$units/$unit"
done
# Replace the updater atomically so this running script keeps its original file.
install -m 755 "$checkout/deploy/update-backend.sh" "$root/update-backend.next"
mv "$root/update-backend.next" "$root/update-backend.sh"
systemctl --user daemon-reload
systemctl --user enable watt-the-hack.service
systemctl --user enable --now watt-the-hack-update.timer
systemctl --user restart watt-the-hack.service
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 \
  --max-time 10 http://127.0.0.1:8787/api/sim/presets
printf '%s\n' "$revision" > "$root/deployed-revision"
echo "Deployed backend from main: $revision"
