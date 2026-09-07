# server

Express + TypeScript REST API for SSC QR Attendance. PostgreSQL schema `ssc`.

```powershell
npm install
npm run ensure-db
npm run seed-admin
npm run dev
```

API listens on `0.0.0.0:8080`. Flutter app Server Settings: `YOUR_LAN_IP:8080`.

Swagger UI: [http://localhost:8080/docs](http://localhost:8080/docs)  
OpenAPI JSON: [http://localhost:8080/openapi.json](http://localhost:8080/openapi.json)

Use **Authorize** in Swagger after `POST /auth/login` and paste the JWT.
