# Hotel Reservation & Management System (HRMS) — Installation & Setup Guide

> **Academic Project:** Master of Computer Applications (MCA) Final Year Project  
> **Repository:** "https://github.com/parteek1206/hotel-management-system"

---

## 📋 Table of Contents
1. [System Prerequisites](#1-system-prerequisites)
2. [Step-by-Step Setup Protocol](#2-step-by-step-setup-protocol)
   - [Step 2.1: Clone Codebase](#step-21-clone-codebase)
   - [Step 2.2: Install Dependencies](#step-22-install-dependencies)
   - [Step 2.3: Configure Environment Variables](#step-23-configure-environment-variables)
   - [Step 2.4: Initialize MySQL Database](#step-24-initialize-mysql-database)
   - [Step 2.5: Provision Administrator Account](#step-25-provision-administrator-account)
3. [Running the Application](#3-running-the-application)
4. [Executing Verification Tests](#4-executing-verification-tests)
5. [Default Academic Credentials](#5-default-academic-credentials)
6. [Troubleshooting & Common Questions](#6-troubleshooting--common-questions)

---

## 1. System Prerequisites

Ensure your host operating system has the following components installed:

| Component | Minimum Version | Verified Version | Purpose |
| :--- | :---: | :---: | :--- |
| **Node.js** | `v20.x LTS` | `v24.16.0 LTS` | Server-side JavaScript runtime |
| **npm** | `v10.x` | `v10.9.2` | Package & dependency manager |
| **MySQL Server** | `8.0+` | `8.4 LTS` | Relational database persistent storage |
| **MySQL Workbench** / CLI | Any modern version | 8.0+ | Database inspection and SQL execution |
| **Web Browser** | Modern | Chrome / Firefox / Edge | Client dashboard interface |

---

## 2. Step-by-Step Setup Protocol

### Step 2.1: Clone Codebase
Clone the project repository from GitHub:
```bash
git clone https://github.com/anish-kumar03/HOTEL-MANAGEMENT-APP.git
cd HOTEL-MANAGEMENT-APP
```

---

### Step 2.2: Install Dependencies
Install all production dependencies and development utilities:
```bash
npm install
```

Installed packages:
- `express`: Core MVC web framework
- `ejs`: Server-side templating engine
- `mysql2`: Fast MySQL driver supporting connection pooling & Promises
- `bcrypt`: 10-round salted password hashing
- `express-session`: Server-side session management
- `helmet`: HTTP security headers and Content Security Policy (CSP)
- `morgan`: Request logging
- `dotenv`: Environment configuration loading
- `nodemon`: Hot-reloading development server (devDependency)

---

### Step 2.3: Configure Environment Variables
Copy the `.env.example` file to create your local `.env`:

**Windows (PowerShell / CMD):**
```powershell
copy .env.example .env
```

**Linux / macOS:**
```bash
cp .env.example .env
```

Open `.env` in your editor and configure your local MySQL credentials:
```env
# Application Runtime
NODE_ENV=development
PORT=3000
APP_NAME="Hotel Reservation & Management System"
APP_URL=http://localhost:3000

# Session Secret (Generate a strong random string)
SESSION_SECRET=hrms_super_secret_session_key_academic_2026_mca

# Initial Administrator Credentials (Used by seed script)
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@grandhorizon.com
ADMIN_PASSWORD=Admin@12345

# MySQL 8.4 LTS Database Credentials
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_actual_mysql_password
DB_NAME=hotel_reservation_db
DB_CONNECTION_LIMIT=10
```

> [!IMPORTANT]
> The `.env` file is excluded from git tracking via `.gitignore`. Never commit `.env` containing production passwords to GitHub.

---

### Step 2.4: Initialize MySQL Database

Open your terminal or MySQL Workbench and execute the database migration and seed scripts:

```bash
# 1. Create database schema, tables, constraints, triggers, and routines:
mysql -u root -p < database/schema.sql

# 2. Populate sample data (10 customers, 15 rooms, bookings, payments, services):
mysql -u root -p < database/seed.sql
```

Alternatively, open `database/schema.sql` and `database/seed.sql` inside **MySQL Workbench** and execute both scripts using the Lightning Bolt button.

---

### Step 2.5: Provision Administrator Account
Run the automated administrator provisioning script:
```bash
npm run seed:admin
```
This script reads `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` from your `.env`, generates a 10-round salted bcrypt hash, and securely inserts the administrator into the `admin_users` table.

---

## 3. Running the Application

### Development Mode (with auto-restart via nodemon)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

Once running, navigate to:
```text
http://localhost:3000
```
You will be directed to the Administrator Sign In screen.

---

## 4. Executing Verification Tests

### Automated Unit, Integration & Security Tests (77 Tests)
Run the complete native test suite:
```bash
npm test
```

### End-to-End Live MySQL Database Tests
Verify live MySQL transactions across all 6 core business modules:
```bash
npm run test:e2e
# or
node test/e2e-db-crud.js
```

---

## 5. Default Academic Credentials

| Parameter | Default Value | Notes |
| :--- | :--- | :--- |
| **Login Portal** | `http://localhost:3000/login` | Public authentication page |
| **Username** | `admin` | Sourced from `ADMIN_USERNAME` |
| **Email Alternative**| `admin@grandhorizon.com` | Can log in with email or username |
| **Password** | `Admin@12345` | Encrypted with 10-round salted bcrypt |
| **Health API** | `http://localhost:3000/health` | Public MySQL connection monitoring |

---

## 6. Troubleshooting & Common Questions

### Q: Why does the terminal show `Access denied for user 'root'@'localhost'`?
**A:** Your local MySQL server requires the password you configured when installing MySQL. Update `DB_PASSWORD=your_password` in your `.env` file and verify your MySQL service is running.

### Q: How do I change the application port?
**A:** Update `PORT=8080` in `.env`. The application will automatically bind to the specified port.

### Q: How do I test unauthenticated access?
**A:** Open an Incognito / Private browsing window and navigate to `http://localhost:3000/customers`. The system will automatically redirect you to `/login?error=unauthorized`.

