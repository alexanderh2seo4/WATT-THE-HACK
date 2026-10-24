# Live demo

- Website: https://alexanderh2seo4.github.io/WATT-THE-HACK/
- Backend: https://kimai.tailb58b58.ts.net:8443/api
- Source: `main` in `alexanderh2seo4/WATT-THE-HACK` (not the separate `deebuggertech` remote).

Every push/merge to `main` automatically builds and publishes the frontend through GitHub Actions.
The backend checks `main` every minute, pulls updates, runs the core smoke tests, and
restarts automatically when backend code, resources or deployment configuration changes.
No GitHub token or SSH deployment secret is needed: the server pulls the public repository.
Changes on other branches go live only after they are merged into `main`.
The repository Actions variable `VITE_API_URL` holds the public backend URL above.
GitHub Pages uses hash routing (`/#/setup`) so both views survive a refresh.
Local development still uses `/api` via Vite's proxy.

## Backend on `alex-linux` / `kimai`

The backend runs as a single-worker FastAPI gateway user service, bound only to `127.0.0.1:8787`.
Tailscale Funnel publishes it on HTTPS port 8443; the existing port 443 service is unchanged.
The machine, WSL and Tailscale must stay running. Each visitor gets a separate Python
worker/simulation, capped at 8 active browser sessions. A random `X-Session-ID` stored
in the browser tab selects its worker and survives refresh. Two minutes without API
requests frees that slot (cleanup every 15 seconds). Visitor 9 sees a capacity message
and automatically retries. There are no authenticated user accounts; only fictional data is used.
`GET /api/health` shows the active session count/capacity without allocating a session.

The managed checkout is `~/apps/watt-the-hack/repo`. Do not edit it directly:
the updater refuses to overwrite local tracked changes. Frontend/documentation-only
pushes do not restart the backend. Backend deployments reset all visitor simulations.

To install the updater on a new server (run locally with this checkout):

```bash
ssh alex-linux 'mkdir -p ~/apps/watt-the-hack ~/.config/systemd/user'
scp deploy/update-backend.sh alex-linux:apps/watt-the-hack/update-backend.sh
scp deploy/watt-the-hack-update.service deploy/watt-the-hack-update.timer alex-linux:.config/systemd/user/
ssh alex-linux 'systemctl --user daemon-reload && systemctl --user enable --now watt-the-hack-update.timer'
```

This needs Git, uv/Python 3.14, and systemd user services. The first timer run clones
the repo, installs dependencies and starts the backend. Initial setup also needs
`tailscale funnel --bg --https=8443 http://127.0.0.1:8787` on the server.
User lingering is already enabled so the service survives SSH logout.

Status / logs:

```bash
ssh alex-linux 'systemctl --user status watt-the-hack --no-pager'
ssh alex-linux 'systemctl --user list-timers watt-the-hack-update.timer --no-pager'
ssh alex-linux 'cat ~/apps/watt-the-hack/deployed-revision'
ssh alex-linux 'journalctl --user -u watt-the-hack -n 40 --no-pager'
ssh alex-linux 'journalctl --user -u watt-the-hack-update -n 40 --no-pager'
```

To check for an update immediately: `ssh alex-linux 'systemctl --user start watt-the-hack-update'`.
