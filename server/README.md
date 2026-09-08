# server

Express + TypeScript REST API for SSC QR Attendance. PostgreSQL schema `ssc`.

```powershell
npm install
npm run ensure-db
npm run seed-admin
npm run dev
```

API listens on `0.0.0.0:8080`.

```powershell
npm run build:web        # Flutter UI → ../app/build/web
npm start                # serves the web app at /  and REST at /api
```

Open `http://YOUR_LAN_IP:8080/` in a browser (superadmin / moderator / student).
Swagger: [http://localhost:8080/docs](http://localhost:8080/docs)  
OpenAPI JSON: [http://localhost:8080/openapi.json](http://localhost:8080/openapi.json)

Use **Authorize** in Swagger after `POST /api/auth/login` and paste the JWT.
