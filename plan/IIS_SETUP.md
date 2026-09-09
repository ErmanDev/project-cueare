# Host SSC QR Attendance on IIS

Phones and browsers connect to an **IIS site host name** (school DNS or the
Windows server name). They do **not** use a laptop LAN IP or port 8080.

```
phone / browser  →  IIS :80 or :443  (attendance.yourschool.edu)
                         ↓  reverse proxy
                    Bun on 127.0.0.1:8080
                         ↓
                    PostgreSQL
```

## Prerequisites

- Windows with **IIS** (Default Web Site is fine to stop; you will add a new site)
- IIS modules: **URL Rewrite** and **Application Request Routing (ARR)**
- Bun, PostgreSQL, and this repo already working via `bun run start` on the server
- A host name that resolves to this Windows machine (school DNS A/CNAME, or the
  computer name such as `SSC-SERVER`)

## 1. Keep Bun on localhost only

In `server/.env`:

```
LISTEN_HOST=127.0.0.1
PORT=8080
TRUST_PROXY=true
```

Then:

```powershell
cd server
bun run ensure-db
bun run seed-admin
bun run build:web
bun start
```

Confirm only on this machine: [http://127.0.0.1:8080/api/health](http://127.0.0.1:8080/api/health)
returns `{"status":"ok",...}`. Other devices should **not** open port 8080.

Keep Bun running across logon with Task Scheduler (At startup, `bun start` in
`server\`) or a service wrapper. IIS only forwards traffic; it does not start
Bun unless you switch to HttpPlatformHandler (see below).

## 2. Enable ARR proxy

In **IIS Manager**:

1. Select the server node (not a site).
2. Open **Application Request Routing Cache** → **Server Proxy Settings**.
3. Check **Enable proxy** → Apply.

Or in an elevated PowerShell:

```powershell
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
  -Filter 'system.webServer/proxy' -Name 'enabled' -Value $true
```

## 3. Create the IIS site

1. **Sites → Add Website**
2. Site name: `SSC QR Attendance`
3. Physical path: this repo's `server` folder (it contains `web.config`)
4. Binding:
   - Type `http`, port `80`, host name `attendance.yourschool.edu`
   - Or add `https` / `443` with a certificate
5. Start the site.

`server/web.config` rewrites every request to `http://127.0.0.1:8080/...` and
lets Express keep its own JSON error bodies.

## 4. Firewall and DNS

- Allow inbound **TCP 80** (and **443** if you use TLS). Do not publish 8080.
- Create a DNS record for the host name that points at this Windows server.
- On a small campus LAN you can use the computer name (`http://SSC-SERVER`) if
  clients resolve it.

## 5. Point the Flutter app at IIS

First launch → Server Settings:

```
attendance.yourschool.edu
```

or `https://attendance.yourschool.edu` when the IIS binding is TLS.

Test connection, then Save. Staff browsers use the same address.

## 6. Optional: IIS starts Bun (HttpPlatformHandler)

Install [HttpPlatformHandler](https://www.iis.net/downloads/microsoft/httpplatformhandler).
Replace `server/web.config` with `server/iis/web.httpplatform.config` (rename it
to `web.config`). Put `bun.exe` on the **system** PATH — the app pool identity
does not see your user PATH. IIS then sets `PORT` and proxies to that process.

## Sanity checklist

- [ ] `http://127.0.0.1:8080/api/health` works on the server
- [ ] IIS site is started; ARR proxy is enabled
- [ ] `http://attendance.yourschool.edu/api/health` works from a phone
- [ ] Flutter Server Settings uses that host name, not an IP:8080
- [ ] Windows Firewall allows 80/443 only
