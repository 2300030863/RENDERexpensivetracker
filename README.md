# Expense Tracker Backend (Node.js & Express)

A high-performance, lightweight Node.js Express backend for the Expense Tracker application, fully compatible with the React frontend and TiDB Cloud / MySQL database.

## Features

- **Authentication & Security:**
  - JWT HS512 Bearer Token authentication (24h validity)
  - BCrypt password hashing compatible with legacy Spring Security passwords
  - Google OAuth login integration
  - 6-digit Email OTP registration verification with HTML email templates
  - Secure UUID-based password reset flow
  - Role-based Access Control (`ROLE_USER`, `ROLE_ADMIN`, `ROLE_OWNER`)
  - User blocking and login enforcement

- **Expense Tracking Operations:**
  - Transaction management with pagination, filtering, searching, and balance updates
  - Default & custom category management with occupation template provisioning
  - Multi-account tracking (Cash, Bank, Credit Card, Savings, Investment)
  - Budget management with date range checking and alert thresholds
  - Recurring transactions with automatic daily cron scheduler (midnight)
  - Comprehensive analytics: monthly trend, category spending, budget status, and dashboard KPIs

- **Administration & Groups:**
  - Data isolation per admin and user groups
  - Role promotion / demotion (Owner only)
  - User management and deletion (with transaction audit preservation)
  - Transaction approval workflow
  - Email broadcasting to user groups or entire roles

- **Dual Route Prefix Compatibility:**
  - All routes are accessible via `/expense-tracker-api/*` (legacy servlet context-path) and `/*` (root), ensuring 100% compatibility with any frontend environment configuration.

## Getting Started

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x
- MySQL or TiDB Cloud instance

### Installation
```bash
cd backend
npm install
```

### Configuration
Copy `.env.example` to `.env` and configure your credentials:
```env
PORT=8086
DB_HOST=gateway01.ap-southeast-1.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=expense_tracker
DB_SSL=true
JWT_SECRET=your_secret_key_matching_512_bits
MAIL_USERNAME=your_email@gmail.com
MAIL_PASSWORD=your_gmail_app_password
FRONTEND_URL=http://localhost:5173
```

### Running Locally
```bash
# Start server
npm start

# Development mode with hot reloading
npm run dev
```

### Deployment (e.g. Render / Railway)
The application can be deployed directly as a native Node.js service:
- **Build command:** `npm install`
- **Start command:** `npm start`
- Set the environment variables in your hosting dashboard matching `.env.example`.
"# RENDERexpensivetracker" 
