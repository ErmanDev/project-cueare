# SSC QR Attendance — IIS Deployment Guide

This guide provides step-by-step instructions for deploying the **SSC QR Attendance** application (Web Admin Portal + REST API) onto a **Windows Server running IIS**.

---

## 📋 Prerequisites

Before deploying, ensure the target Windows Server has:

1. **IIS (Internet Information Services)** installed.
2. **HttpPlatformHandler v1.2+** installed on IIS ([Download HttpPlatformHandler from Microsoft](https://www.iis.net/downloads/microsoft/httpplatformhandler)).
3. **Bun 1.4.2** installed on the server (recommended path: `C:\bun\bun.exe`).
4. **PostgreSQL Database** (local or remote) running and accessible from the server.
5. **Windows Firewall** allowing inbound traffic on Port 80 (HTTP) or 443 (HTTPS).

---

## 🛠️ Step 1: Build the Deployment Package

On your development machine, open PowerShell in the project root:

```powershell
cd apps/api
bun run build:iis
```

This generates a ready-to-deploy package folder at:
📍 **`apps/api/dist-iis`**

---

## 📁 Step 2: Copy Package to IIS

1. Create a folder for your website on the server, e.g.:
   `C:\inetpub\wwwroot\ssc-qr-attendance`

2. Copy **all files and subfolders** inside `apps/api/dist-iis` directly into `C:\inetpub\wwwroot\ssc-qr-attendance`.

Your target directory should look like this:
```text
C:\inetpub\wwwroot\ssc-qr-attendance\
├── public/                 (Built React web frontend)
├── src/                    (Express API source code)
├── scripts/                (Database & setup scripts)
├── iis/                    (Alternative configs)
├── logs/                   (Pre-created log folder)
├── .iis-tmp/               (Temporary folder for IIS Bun process)
├── .env                    (Environment variables)
├── package.json
├── bun.lock
├── tsconfig.json
└── web.config              (IIS HttpPlatformHandler config)
```

---

## ⚙️ Step 3: Configure Environment & Database

Open PowerShell **as Administrator** in `C:\inetpub\wwwroot\ssc-qr-attendance`:

1. **Configure Database Credentials (`.env`)**:
   Open `.env` in a text editor and update your database credentials:
   ```env
   APP_ENV=production
   LISTEN_HOST=127.0.0.1
   PORT=8080
   TRUST_PROXY_HOPS=1
   CORS_ALLOWED_ORIGINS=https://attendance.yourschool.edu

   DATABASE_HOST=127.0.0.1
   DATABASE_PORT=5432
   DATABASE_NAME=ssc_qr_attendance
   DATABASE_USER=ssc_attendance_app
   DATABASE_PASSWORD=use-a-secret-manager-value
   DATABASE_SSL_MODE=disable
   AUTO_MIGRATE=false

   JWT_SECRET=use-at-least-32-random-characters
   QR_HMAC_SECRET=use-a-different-32-character-secret
   ```

   `DATABASE_SSL_MODE=disable` is accepted in production only for a loopback
   database. Use `verify-full` (and `DATABASE_SSL_CA` when needed) for a remote
   PostgreSQL server. Store production secrets outside the deployment package.

2. **Install Dependencies & Initialize Database**:
   Run the following commands:
   ```powershell
   bun install
   bun run ensure-db
   bun run migrate:verify
   bun run migrate:up
   bun run seed-admin
   bun run seed-fine-templates
   ```

   Run `migrate:up` once as a deployment step before starting or recycling API
   instances. Production application startup verifies the recorded migration
   history and does not modify the schema.

---

## 🌐 Step 4: Configure IIS Website

1. Open **IIS Manager** (`inetmgr.exe`).
2. Verify **HttpPlatformHandler** is present in *Server Modules*.
3. Right-click **Sites** → **Add Website**:
   - **Site name**: `SSC QR Attendance`
   - **Physical path**: `C:\inetpub\wwwroot\ssc-qr-attendance`
   - **Binding**: Type `http`, Port `80` (or set your host name e.g. `attendance.yourschool.edu`).
4. Select **Application Pools** on the left menu:
   - Find `SSC QR Attendance` pool.
   - Click **Basic Settings...**
   - Set **.NET CLR version** to **No Managed Code**.
   - Click **OK**.
5. Check `web.config` line 12:
   ```xml
   <httpPlatform processPath="C:\bun\bun.exe" arguments="src/nest/main.ts" ... />
   ```
   *Ensure `processPath` matches the location of `bun.exe` on your server.*

6. **Start** the website in IIS.

---

## ✅ Step 5: Verification & Firewall

1. **Test API Health**:
   Open a browser on the server and go to:
   `http://localhost/api/health`
   Expected response: `{"status":"ok",...}`

2. **Test Web Portal**:
   Navigate to:
   `http://localhost/`
   Log in using the seeded admin credentials.

3. **Configure Windows Firewall**:
   Run in elevated PowerShell to allow client devices (phones/laptops) to reach IIS:
   ```powershell
   New-NetFirewallRule -DisplayName "IIS HTTP (Port 80)" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
   ```

---

## 🔍 Troubleshooting Guide

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **HTTP 502.3 Bad Gateway** | `bun.exe` path in `web.config` is wrong or Bun crashed on startup. | Check `processPath` in `web.config` and inspect logs in `C:\inetpub\wwwroot\ssc-qr-attendance\logs\`. |
| **HTTP 500 Internal Server Error** | Database connection failed or missing `.env`. | Verify PostgreSQL is running and `.env` credentials are correct. Run `bun run ensure-db` manually. |
| **500.19 Config Error** | HttpPlatformHandler module is not installed. | Install HttpPlatformHandler v1.2+ for IIS and restart IIS (`iisreset`). |
| **Web UI returns 404 on assets** | Missing `public/` directory. | Re-run `bun run build:iis` and copy the updated `public` folder. |

---

## 📱 Mobile App Connection Settings

When connecting the Android/Flutter mobile app to the server:
- Open app **Server Settings**.
- Enter your IIS host name or server IP:
  ```text
  attendance.yourschool.edu
  ```
  *(or `http://192.168.1.100` if on a local network without DNS)*.
