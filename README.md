# 📹 MeetX — Google Meet Clone with Attendance & Attentiveness

A full-stack video conferencing platform with:
- ✅ HD video for **up to 80 participants** (via LiveKit Cloud)
- ✅ **Google Sign-in** with name + roll number profiles
- ✅ **Attendance tracking** — join/leave timestamps, % attended, CSV export
- ✅ **Attentiveness ping** — host plays a tone to check if a student is listening
- ✅ Real-time chat
- ✅ Screen sharing
- ✅ Deployable online (Vercel + Railway)

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS |
| Video/Audio | LiveKit Cloud (SFU, supports 80+ users) |
| Real-time | Socket.io |
| Auth | Firebase (Google Sign-in) |
| Backend | Node.js + Express |
| Database | PostgreSQL via Supabase + Prisma ORM |
| Deployment | Vercel (frontend) + Railway (backend) |

---

## ⚙️ Setup Guide

### Prerequisites
- [Node.js 18+](https://nodejs.org) — **install this first**
- [Git](https://git-scm.com)
- Accounts on: LiveKit Cloud, Firebase, Supabase, Vercel, Railway (all free)

---

### Step 1 — Install Node.js

Download and install from: https://nodejs.org/en/download (choose LTS)

After installing, verify in a new terminal:
```bash
node --version   # should show v18 or higher
npm --version    # should show 9 or higher
```

---

### Step 2 — Set up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"** → name it `meetx`
3. In your project → **Authentication** → **Sign-in method** → Enable **Google**
4. Go to **Project Settings** → **Service accounts** → **Generate new private key**
   - Download the JSON file (keep it safe, don't share it!)
5. Go to **Project Settings** → **Your apps** → **Web** → Register app
   - Copy the `firebaseConfig` object values

---

### Step 3 — Set up LiveKit Cloud

1. Go to [LiveKit Cloud](https://cloud.livekit.io) → Sign up free
2. Create a new project (e.g., "meetx")
3. Copy your **API Key** and **API Secret** from the project dashboard
4. Copy the **WebSocket URL** (format: `wss://your-project.livekit.cloud`)
5. In **Settings → Webhooks** → Add webhook endpoint:
   - URL: `https://your-backend.railway.app/api/webhook/livekit` (fill in after Railway deploy)
   - Events: check `participant_joined`, `participant_left`, `room_finished`
   - Copy the **webhook signing secret**

---

### Step 4 — Set up Supabase (Database)

1. Go to [Supabase](https://supabase.com) → New project
2. Choose a strong password and save it
3. Go to **Settings → Database → Connection String → URI**
4. Copy the connection string (looks like `postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres`)

---

### Step 5 — Configure Environment Variables

**Backend (`server/.env`):**
```bash
# Copy server/.env.example → server/.env and fill in:
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
LIVEKIT_WS_URL=wss://your-project.livekit.cloud
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
DATABASE_URL="postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres"
LIVEKIT_WEBHOOK_SECRET=your_webhook_secret
```

**Frontend (`client/.env`):**
```bash
# Copy client/.env.example → client/.env and fill in:
VITE_API_URL=http://localhost:5000
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

---

### Step 6 — Install Dependencies & Run Locally

```bash
# In the meet-x root folder:

# Install server dependencies
cd server
npm install

# Set up the database (creates tables)
npx prisma generate
npx prisma migrate dev --name init

# Start the backend server (keep this running)
npm run dev

# Open a NEW terminal tab:
cd client
npm install
npm run dev
```

Now open http://localhost:5173 in your browser!

---

## 🚀 Deploy Online

### Deploy Backend to Railway

1. Go to [Railway](https://railway.app) → New Project → Deploy from GitHub
2. Select the `server/` folder as the root directory
3. Add all your server environment variables in Railway's **Variables** tab
4. Change `NODE_ENV=production` and `CLIENT_URL=https://your-vercel-url.vercel.app`
5. Railway will auto-detect Node.js and deploy
6. Copy your Railway URL (e.g., `https://meetx-server.railway.app`)

### Deploy Frontend to Vercel

1. Go to [Vercel](https://vercel.com) → New Project → Import from GitHub
2. Set **Root Directory** to `client`
3. Set **Build Command** to `npm run build`
4. Set **Output Directory** to `dist`
5. Add all `VITE_*` environment variables
6. Set `VITE_API_URL=https://meetx-server.railway.app`
7. Deploy!

### Finish LiveKit Webhook Setup
After Railway deploys:
- Go back to LiveKit Cloud → Webhooks
- Set the URL to: `https://meetx-server.railway.app/api/webhook/livekit`

---

## 📱 How to Use

### As a Teacher/Host:
1. Sign in with Google → complete profile (name + roll number)
2. Click **"New Meeting"** → copy the room code
3. Share room code with students
4. During meeting:
   - Click **👥 People** → see all participants → click **🔔 Ping** to check attention
   - Click **📋 Attendance** → see live attendance dashboard
5. Click **"End Meeting"** → redirects to full attendance report
6. Export CSV for your gradebook

### As a Student:
1. Sign in with Google → complete profile (name + roll number)
2. Enter the room code → click **Join**
3. If the host pings you → a tone plays + banner appears → click **"I'm here!"**
4. View your own attendance history at **"My Attendance"**

---

## 🔔 Attentiveness Ping Flow

```
Host → clicks "🔔 Ping" on a student
     ↓
Socket.io sends ping to that student only
     ↓
Student's browser: alarm tone plays + fullscreen banner appears
     ↓
Student moves mouse / presses key / clicks "I'm here!"
     ↓
Socket.io notifies host: "✅ Reacted in 3.2s"
     ↓
If no reaction in 10s → host sees "❌ No reaction"
     ↓
All ping events stored in database for attentiveness report
```

---

## 📋 Attendance System

Every time a participant joins or leaves, LiveKit sends a webhook to the backend. The backend records:
- **joinedAt**: exact UTC timestamp
- **leftAt**: exact UTC timestamp
- **totalSeconds**: leftAt - joinedAt
- **percentage**: (totalSeconds / meetingDuration) × 100

Status thresholds:
| Status | Percentage |
|--------|-----------|
| ✅ Good | ≥ 75% |
| ⚠️ Partial | 50–74% |
| ❌ Poor | < 50% |

---

## 📁 Project Structure

```
meet-x/
├── client/          # React frontend → Vercel
│   ├── src/
│   │   ├── pages/   # Landing, Login, Meeting, Attendance, MyHistory
│   │   ├── components/ # VideoGrid, Chat, ParticipantPanel, etc.
│   │   ├── context/ # AuthContext
│   │   ├── lib/     # firebase.js, socket.js
│   │   └── utils/   # tone.js, exportCsv.js
│   └── vercel.json
└── server/          # Node.js backend → Railway
    ├── src/
    │   ├── routes/  # auth, meetings, livekit, attendance, webhook
    │   ├── socket/  # Socket.io handlers (pings, chat, participants)
    │   └── middleware/ # Firebase token verification
    ├── prisma/      # Database schema
    └── railway.toml
```

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Meeting not found" | Make sure the room code is correct (case-sensitive) |
| Video not loading | Allow camera/microphone permissions in browser |
| Attendance not recording | Check LiveKit webhook is configured with correct Railway URL |
| Firebase auth error | Make sure Google Sign-in is enabled in Firebase Console |
| CORS error | Set `CLIENT_URL` in Railway env vars to your Vercel URL |
