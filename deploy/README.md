# Live demo

- Website: https://alexanderh2seo4.github.io/WATT-THE-HACK/
- Backend: https://kimai.tailb58b58.ts.net:8443/api
- Source: `main` in `alexanderh2seo4/WATT-THE-HACK` (not the separate `deebuggertech` remote).

GitHub Actions builds and publishes the frontend on changes to `frontend/` on `main`.
The repository Actions variable `VITE_API_URL` holds the public backend URL above.
GitHub Pages uses hash routing (`/#/setup`) so both views survive a refresh.
Local development still uses `/api` via Vite's proxy.

## Backend on `alex-linux` / `kimai`

The backend runs as a user systemd service, bound only to `127.0.0.1:8787`.
Tailscale Funnel publishes it on HTTPS port 8443; the existing port 443 service is unchanged.
The machine, WSL and Tailscale must stay running. The demo has one shared, public,
unauthenticated simulation; all visitors can change it, and a restart resets it.
Use only the fictional supplied data.

To update the backend from this checkout (the first two commands run locally):

```bash
rsync -az --exclude=.venv --exclude=__pycache__ --exclude=.pytest_cache backend resources alex-linux:apps/watt-the-hack/
scp deploy/watt-the-hack.service alex-linux:.config/systemd/user/watt-the-hack.service
ssh alex-linux 'cd ~/apps/watt-the-hack/backend && uv sync --locked && systemctl --user daemon-reload && systemctl --user restart watt-the-hack'
```

Initial setup also needs `systemctl --user enable --now watt-the-hack` and
`tailscale funnel --bg --https=8443 http://127.0.0.1:8787` on the server.
User lingering is already enabled so the service survives SSH logout.

Status / logs:

```bash
ssh alex-linux 'systemctl --user status watt-the-hack --no-pager'
ssh alex-linux 'journalctl --user -u watt-the-hack -n 40 --no-pager'
```
