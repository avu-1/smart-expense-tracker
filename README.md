# 💰 SpendWise — Smart Expense Tracker with AI Insights

A production-ready full-stack web application for tracking income/expenses, visualizing spending patterns, setting budgets, and receiving AI-powered financial insights.

---

## 📁 Project Structure

```
smart-expense-tracker/
│
├── package.json              ← Root: runs client + server together
│
├── server/                   ← Node.js + Express Backend
│   ├── index.js              ← Server entry point
│   ├── package.json
│   ├── .env.example          ← Copy to .env and fill in values
│   │
│   ├── config/
│   │   ├── db.js             ← MongoDB connection
│   │   ├── redis.js          ← Redis caching (optional)
│   │   └── seed.js           ← Sample data seeder
│   │
│   ├── models/
│   │   ├── User.js           ← User schema (name, email, password)
│   │   ├── Transaction.js    ← Transaction schema
│   │   └── Budget.js         ← Monthly budget schema
│   │
│   ├── controllers/
│   │   ├── authController.js         ← Register / Login / Me
│   │   ├── transactionController.js  ← CRUD transactions
│   │   ├── analyticsController.js    ← Dashboard + yearly charts
│   │   ├── budgetController.js       ← Set / get / delete budget
│   │   └── insightsController.js     ← AI financial insights
│   │
│   ├── routes/
│   │   ├── auth.js
│   │   ├── transactions.js
│   │   ├── analytics.js
│   │   ├── budget.js
│   │   └── insights.js
│   │
│   └── middleware/
│       ├── auth.js           ← JWT verification middleware
│       └── errorHandler.js   ← Centralized error handling
│
└── client/                   ← React Frontend
    ├── package.json
    ├── tailwind.config.js
    ├── postcss.config.js
    │
    └── src/
        ├── App.js            ← Root component + routing
        ├── index.js          ← React entry point
        ├── index.css         ← Tailwind + global styles
        │
        ├── context/
        │   └── AuthContext.js  ← Global auth state
        │
        ├── utils/
        │   ├── api.js          ← Axios instance with JWT interceptor
        │   └── format.js       ← Currency, date, category helpers
        │
        ├── components/
        │   └── Layout.js       ← Sidebar + main shell
        │
        └── pages/
            ├── LoginPage.js
            ├── RegisterPage.js
            ├── DashboardPage.js    ← Charts, stats, recent transactions
            ├── TransactionsPage.js ← CRUD with filters + pagination
            ├── ReportsPage.js      ← Yearly analytics
            └── BudgetPage.js       ← Budget planner
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS, Chart.js |
| Backend | Node.js, Express.js |
| Database | MongoDB with Mongoose |
| Auth | JWT + bcryptjs |
| Caching | Redis (optional — app works without it) |
| AI Insights | Mock logic engine (OpenAI optional) |
| HTTP Client | Axios |
| Notifications | react-hot-toast |

---

## ⚙️ Prerequisites

Make sure you have these installed:

- **Node.js** v18+ → [nodejs.org](https://nodejs.org)
- **MongoDB** (local or Atlas) → [mongodb.com](https://www.mongodb.com)
- **Redis** (optional) → [redis.io](https://redis.io)
- **npm** v9+

Check versions:
```bash
node --version   # Should be v18+
npm --version    # Should be v9+
mongod --version # Should be v6+
```

---

## 🚀 Setup Instructions

### Step 1 — Clone or extract the project

```bash
# If using git
git clone <repo-url>
cd smart-expense-tracker

# Or just cd into the extracted folder
cd smart-expense-tracker
```

### Step 2 — Install all dependencies

```bash
# Install root + server + client dependencies in one command
npm run install:all
```

This installs:
- Root `concurrently` package
- All server packages (express, mongoose, jwt, bcrypt, etc.)
- All client packages (react, chart.js, axios, tailwind, etc.)

### Step 3 — Set up environment variables

```bash
# Copy the example env file
cp server/.env.example server/.env
```

Now open `server/.env` and fill in your values:

```env
PORT=5000
NODE_ENV=development

# Your MongoDB connection string
# Local:  mongodb://localhost:27017/smart-expense-tracker
# Atlas:  mongodb+srv://user:pass@cluster.mongodb.net/smart-expense-tracker
MONGO_URI=mongodb://localhost:27017/smart-expense-tracker

# A long random secret for JWT signing (any random string)
JWT_SECRET=my_super_secret_key_change_this_please_123456

# Redis (optional — leave as-is if not using Redis)
REDIS_URL=redis://localhost:6379

# OpenAI API key (optional — mock insights are used if not provided)
OPENAI_API_KEY=your_openai_api_key_here

# Frontend URL (for CORS)
CLIENT_URL=http://localhost:3000
```

### Step 4 — Start MongoDB

```bash
# On macOS/Linux (if installed locally)
mongod

# On Windows (run as administrator)
net start MongoDB

# Or use MongoDB Atlas (cloud) — just update MONGO_URI in .env
```

### Step 5 — Seed sample data (recommended for first run)

```bash
npm run seed
```

This creates:
- ✅ Demo user: `demo@example.com` / `demo123`
- ✅ 60 sample transactions (last 3 months)
- ✅ Sample budget of ₹50,000 for current month

### Step 6 — Run the application

```bash
# Run both frontend and backend simultaneously
npm run dev
```

This starts:
- 🚀 **Backend** at `http://localhost:5000`
- ⚛️  **Frontend** at `http://localhost:3000`

The browser should open automatically. If not, visit `http://localhost:3000`.

---

## 🧪 Running Separately

```bash
# Backend only
npm run dev:server

# Frontend only
npm run dev:client
```

---

## 🔑 API Reference

All protected routes require: `Authorization: Bearer <token>`

### Auth
| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| POST | `/api/auth/register` | Create account | No |
| POST | `/api/auth/login` | Login, get JWT | No |
| GET | `/api/auth/me` | Get current user | Yes |

### Transactions
| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| GET | `/api/transactions` | List transactions (filterable) | Yes |
| POST | `/api/transactions` | Add transaction | Yes |
| PUT | `/api/transactions/:id` | Update transaction | Yes |
| DELETE | `/api/transactions/:id` | Delete transaction | Yes |

**GET Query params:** `?type=expense&category=Food&page=1&limit=20&startDate=2024-01-01`

### Analytics
| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| GET | `/api/analytics/dashboard` | Dashboard data + charts | Yes |
| GET | `/api/analytics/yearly` | Full year month-by-month | Yes |

**Query params:** `?year=2024&month=1`

### Budget
| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| GET | `/api/budget` | Get budget for month | Yes |
| POST | `/api/budget` | Set/update budget | Yes |
| DELETE | `/api/budget/:month` | Delete budget | Yes |

**Body (POST):** `{ "limit": 50000, "month": "2024-01" }`

### Insights
| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| GET | `/api/insights` | AI financial insights | Yes |

---

## 🗃 Database Schema

### Users
```js
{
  name: String,        // "Alex Johnson"
  email: String,       // unique, lowercase
  password: String,    // bcrypt hashed
  currency: String,    // default "₹"
  createdAt: Date,
  updatedAt: Date
}
```

### Transactions
```js
{
  userId: ObjectId,    // ref: User
  amount: Number,      // positive
  type: String,        // "income" | "expense"
  category: String,    // "Food", "Salary", etc.
  date: Date,
  note: String,        // optional, max 200 chars
  createdAt: Date,
  updatedAt: Date
}
```

### Budgets
```js
{
  userId: ObjectId,    // ref: User
  limit: Number,       // monthly spending limit
  month: String,       // "YYYY-MM" e.g. "2024-01"
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🧩 Core Features

### 1. Authentication
- JWT-based login/register with bcrypt password hashing
- Token stored in `localStorage`, auto-attached via Axios interceptor
- Expired token → auto redirect to login

### 2. Transactions
- Add, edit, delete income and expense transactions
- Fields: amount, type, category, date, note
- Filters: by type, category, date range
- Pagination (20 per page)

### 3. Dashboard
- Monthly income/expense/savings summary cards
- Income vs Expense bar chart (6 months)
- Category-wise doughnut chart
- Savings trend line chart
- Budget progress bar with alerts
- Recent transactions list

### 4. Budget System
- Set monthly spending limit per month
- Real-time progress tracking
- Color-coded: 🟢 Safe / 🟡 Warning (80%) / 🔴 Exceeded (100%)
- Alert banners on dashboard

### 5. AI Insights
- Analyzes current vs previous month spending
- Generates insights like:
  - "You spent 35% more on Food this month"
  - "Your savings dropped by 22% compared to last month"
  - "Budget Warning — 85% of budget used"
- Falls back to smart mock engine if OpenAI key not provided
- Cached in Redis for 30 minutes

### 6. Reports
- Full yearly bar chart (income vs expense)
- Monthly savings trend line chart
- Month-by-month breakdown table
- Year selector (current year, last 2 years)

### 7. Performance (Redis Caching)
- Dashboard analytics: 5-minute cache
- Yearly data: 10-minute cache
- AI insights: 30-minute cache
- Cache auto-invalidated when transactions change
- App works gracefully without Redis

---

## 🎨 Design System

The UI uses a dark theme (`slate-950` base) with:
- **Font:** Syne (display/headings) + DM Sans (body)
- **Accent:** Emerald green (`#10b981`) for primary actions
- **Cards:** `slate-900` with `slate-800` borders
- **Status colors:** Emerald (success), Amber (warning), Red (danger)

---

## 🐛 Troubleshooting

**MongoDB connection fails:**
```bash
# Check if MongoDB is running
mongod --version
sudo systemctl status mongod  # Linux
brew services list | grep mongo  # macOS
```

**Port already in use:**
```bash
# Kill process on port 5000
lsof -ti:5000 | xargs kill -9
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

**npm install fails:**
```bash
# Clear cache and retry
npm cache clean --force
rm -rf node_modules
npm install
```

**Redis not available:**
The app works fine without Redis. You'll see this in the console:
```
⚠️  Redis not available - running without cache
```
This is not an error — just a warning.

---

## 🔒 Security Notes

- Passwords are hashed with bcrypt (12 salt rounds)
- JWTs expire after 7 days
- All API routes (except auth) require valid JWT
- Input validation on all endpoints using `express-validator`
- CORS restricted to client URL only
- Mongoose prevents NoSQL injection via schema typing

---

## 🚢 Production Deployment

### Backend (Render / Railway / Heroku)
1. Set environment variables in your hosting dashboard
2. Set `NODE_ENV=production`
3. Use MongoDB Atlas for the database
4. Use Redis Cloud (Upstash) for caching

### Frontend (Vercel / Netlify)
1. `cd client && npm run build`
2. Upload the `build/` folder
3. Set API proxy or update axios `baseURL` to your deployed backend URL

---

## 📝 License

MIT — free to use, modify, and distribute.

---

Built with ❤️ using React, Node.js, MongoDB, and Chart.js
