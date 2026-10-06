# PostgreSQL Database Backup, Clone & Restore Guide

This guide provides step-by-step instructions for managing, copying, dumping, and restoring PostgreSQL databases for the **SSC QR Attendance System** (`project-cueare`) on Windows.

---

## 📌 Environment Details
* **PostgreSQL Version**: 18.x
* **PostgreSQL Binaries Path**: `C:\Program Files\PostgreSQL\18\bin\`
* **Default Application Database**: `ssc`
* **Default Database User**: `postgres`
* **Default Port**: `5432`
* **Schema Name**: `ssc`

---

## 🛠️ Table of Contents
1. [Cloning a Database Directly in `psql`](#1-cloning-a-database-directly-in-psql)
2. [Copying Schema & Data Between Existing Databases](#2-copying-schema--data-between-existing-databases)
3. [Dumping / Backing Up to a File](#3-dumping--backing-up-to-a-file)
4. [Restoring from a Backup File](#4-restoring-from-a-backup-file)
5. [psql Interactive Quick Reference](#5-psql-interactive-quick-reference)

---

## 1. Cloning a Database Directly in `psql`

When you want to duplicate an entire database to a new name (e.g., `ssc_backup` or `ssc_dev`) on the same server.

### Steps inside `psql`:

1. **Connect to the maintenance database (`postgres`):**
   ```sql
   \c postgres
   ```

2. **Temporarily prevent new connections to `ssc` and terminate active sessions:**
   ```sql
   ALTER DATABASE ssc WITH ALLOW_CONNECTIONS = false;
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'ssc' AND pid <> pg_backend_pid();
   ```

3. **Clone the database:**
   ```sql
   CREATE DATABASE ssc_backup WITH TEMPLATE ssc;
   ```

4. **Re-allow connections to the source database:**
   ```sql
   ALTER DATABASE ssc WITH ALLOW_CONNECTIONS = true;
   ```

5. **Verify the new database:**
   ```sql
   \l
   ```

---

## 2. Copying Schema & Data Between Existing Databases

When the target database already exists (for example, copying `ssc` contents into `postgres`):

### Option A: Using PowerShell / CMD (Recommended)
```powershell
# 1. Export ssc database to a temporary file
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -h localhost -d ssc -f "ssc_export.sql"

# 2. Import into target database (e.g. postgres)
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d postgres -f "ssc_export.sql"
```

### Option B: 1-Line Stream (No temporary file)
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -h localhost -d ssc | & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d postgres
```

---

## 3. Dumping / Backing Up to a File

### Method A: Custom Archive Format (`.dump` - Fast, Compressed)
Best for backups, migration, and selective restoration:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -h localhost -p 5432 -d ssc -F c -f "C:\Users\Ace\Desktop\ssc_backup.dump"
```

### Method B: Plain SQL Format (`.sql` - Human Readable)
Best if you want to inspect or edit the SQL statements:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -h localhost -p 5432 -d ssc -F p -f "C:\Users\Ace\Desktop\ssc_backup.sql"
```

### Method C: Run from inside `psql` (Without Exiting)
Prefix the command with `\!`:
```sql
\! "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -h localhost -d ssc -F c -f "C:\Users\Ace\Desktop\ssc_backup.dump"
```

---

## 4. Restoring from a Backup File

### Restoring from `.dump` (Custom Format)
1. **Create the target database in `psql`:**
   ```sql
   \c postgres
   CREATE DATABASE ssc_new;
   ```

2. **Restore using `pg_restore` (in PowerShell / CMD):**
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -U postgres -h localhost -d ssc_new -v "C:\Users\Ace\Desktop\ssc_backup.dump"
   ```

### Restoring from `.sql` (Plain SQL Format)
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d ssc_new -f "C:\Users\Ace\Desktop\ssc_backup.sql"
```

---

## 5. `psql` Interactive Quick Reference

| Command | Description | Example |
| :--- | :--- | :--- |
| `\q` | Exit `psql` and return to Windows terminal | `\q` |
| `\c <dbname>` | Connect to a different database | `\c ssc` |
| `\l` | List all databases on the server | `\l` |
| `\dt` | List all tables in current schema | `\dt` |
| `SET search_path TO ssc;` | Set schema context to `ssc` | `SET search_path TO ssc;` |
| `\! <command>` | Execute a Windows command line utility | `\! dir` |
| `\?` | Show full list of `psql` slash commands | `\?` |

---

## 💡 Automating with Application Scripts
You can also run project maintenance commands directly via Bun:
* Check table counts: `bun scripts/count_tables.ts`
* Ensure database schema: `bun scripts/ensure-database.ts`
