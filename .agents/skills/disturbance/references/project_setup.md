# Project Setup Reference

## Table of Contents
1. Prerequisites
2. PostgreSQL Local Setup (Windows)
3. Backend Bootstrap Commands
4. Frontend Bootstrap Commands
5. Environment Variables
6. Running Dev Servers
7. Django Management Commands
8. Common Troubleshooting

---

## 1. Prerequisites

Install these before starting:
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ (local, no cloud needed)
- Git

---

## 2. PostgreSQL Local Setup (Windows)

After installing PostgreSQL:

```sql
-- Open psql as postgres superuser:
-- Start > PostgreSQL > SQL Shell (psql)

CREATE DATABASE powerdisturbance;
CREATE USER pduser WITH PASSWORD 'pdpass';
GRANT ALL PRIVILEGES ON DATABASE powerdisturbance TO pduser;
\q
```

Verify connection:
```bash
psql -h localhost -U pduser -d powerdisturbance
```

---

## 3. Backend Bootstrap Commands

```bash
# From project root
mkdir power-disturbance
cd power-disturbance

# Create and activate virtualenv
python -m venv venv
venv\Scripts\activate          # Windows PowerShell
# source venv/bin/activate     # Linux/macOS

# Install dependencies
pip install django==4.2 djangorestframework psycopg2-binary \
            django-cors-headers python-dotenv \
            comtrade pandas openpyxl numpy scipy

# Generate requirements.txt
pip freeze > backend/requirements.txt

# Create Django project
django-admin startproject config backend
cd backend

# Create apps
python manage.py startapp core
python manage.py startapp disturbances
python manage.py startapp analysis

# Move app folders into apps/ subdirectory
mkdir apps
move core apps\core
move disturbances apps\disturbances
move analysis apps\analysis

# Update each app's apps.py: change name to 'apps.core' etc.
```

After setting up settings (see django_backend.md):

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser   # Optional, for admin access
```

---

## 4. Frontend Bootstrap Commands

```bash
# From project root (power-disturbance/)
mkdir frontend
cd frontend

# Scaffold Vite React app in current directory
npm create vite@latest . -- --template react

# Install dependencies
npm install
npm install axios echarts echarts-for-react react-router-dom
```

### vite.config.js (with proxy)

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
```

---

## 5. Environment Variables

Create `backend/.env`:

```env
DJANGO_SETTINGS_MODULE=config.settings.local
SECRET_KEY=your-random-secret-key-here
DB_NAME=powerdisturbance
DB_USER=pduser
DB_PASSWORD=pdpass
DB_HOST=localhost
DB_PORT=5432
```

Generate a secure key:
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

---

## 6. Running Dev Servers

Open two terminals:

**Terminal 1 — Django backend:**
```bash
cd power-disturbance/backend
venv\Scripts\activate
set DJANGO_SETTINGS_MODULE=config.settings.local  # Windows
python manage.py runserver 8000
```

**Terminal 2 — React frontend:**
```bash
cd power-disturbance/frontend
npm run dev
```

App is available at: http://localhost:5173
API is available at: http://localhost:8000/api/v1/
Django admin: http://localhost:8000/admin/

---

## 7. Django Management Commands

```bash
# Migrations
python manage.py makemigrations
python manage.py migrate
python manage.py showmigrations

# Shell for debugging
python manage.py shell

# Check for issues
python manage.py check

# Collect static files (for production)
python manage.py collectstatic

# Clear all disturbance records (dev only)
python manage.py shell -c "from apps.disturbances.models import DisturbanceRecord; DisturbanceRecord.objects.all().delete()"
```

---

## 8. Common Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `psycopg2` install fails | Missing PostgreSQL dev libs | Install PostgreSQL first; use `psycopg2-binary` |
| `comtrade` import error | Not installed | `pip install comtrade` |
| CORS error in browser | CORS middleware missing | Add `corsheaders` to INSTALLED_APPS and MIDDLEWARE in correct order |
| 500 on upload | Media directory missing | Create `backend/media/uploads/` folder |
| Vite proxy not working | Wrong proxy config | Check baseURL in api/client.js matches vite proxy key (`/api`) |
| `Apps aren't loaded yet` | Missing `apps.` prefix | Add `apps.` to app names in INSTALLED_APPS and apps.py `name` field |
