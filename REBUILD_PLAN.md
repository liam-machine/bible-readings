# Bible Reading PWA v2.0 - Rebuild Plan

## Overview

Rebuild the Bible Reading PWA from scratch using:
- **Vercel Hobby Plan** for hosting (free, global CDN)
- **Supabase Free Plan** for database (free, PostgreSQL)
- **Vite** as build tool (fast, PWA plugin)
- **Offline-first architecture** with IndexedDB

This plan preserves the app's simplicity while adding real cross-device sync.

---

## Why Rebuild?

| Current | Proposed |
|---------|----------|
| GitHub Pages hosting | Vercel (better PWA support, preview deploys) |
| localStorage only | IndexedDB + Supabase sync |
| URL-based sync (manual) | Automatic cloud sync |
| No auth | Google OAuth (sign in with Gmail) |
| Vanilla JS (no build) | Vite + Vanilla JS (fast builds, PWA plugin) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         USER DEVICE                          │
│                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌────────────────┐ │
│   │     UI      │◄──►│  App Logic  │◄──►│ Service Worker │ │
│   └─────────────┘    └──────┬──────┘    └───────┬────────┘ │
│                             │                    │          │
│                    ┌────────┴────────┐  ┌───────┴───────┐  │
│                    │   IndexedDB     │  │ Cache Storage │  │
│                    │   (Dexie.js)    │  │  (Workbox)    │  │
│                    └────────┬────────┘  └───────────────┘  │
│                             │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         VERCEL                               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Edge CDN (Static Hosting)               │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        SUPABASE                              │
│   ┌───────────────┐   ┌──────────────┐   ┌──────────────┐  │
│   │ Auth Service  │   │  PostgreSQL  │   │     RLS      │  │
│   │ (Google OAuth)│   │   Database   │   │  Policies    │  │
│   └───────────────┘   └──────────────┘   └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 1: Infrastructure Setup

### 1.1 Vercel Hobby Plan

**Free Tier Limits (2025):**
| Resource | Limit | Our Usage |
|----------|-------|-----------|
| Bandwidth | 100 GB/month | ~1 GB/month |
| Build Minutes | 6,000/month | ~10/month |
| Serverless Invocations | 150,000/month | 0 (not needed) |
| Projects | Unlimited | 1 |

**Setup Steps:**
1. Sign up at [vercel.com](https://vercel.com) with GitHub
2. Import repository
3. Configure as static site (no build command for initial deploy)
4. Add environment variables for Supabase

**vercel.json Configuration:**
```json
{
  "headers": [
    {
      "source": "/service-worker.js",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    },
    {
      "source": "/(.*).(?:js|css|png|jpg|json)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

**Key Benefits over GitHub Pages:**
- Preview deployments for every branch/PR
- Instant rollbacks
- Environment variables (needed for Supabase keys)
- Global edge network (faster)
- Better caching control

---

### 1.2 Supabase Free Plan

**Free Tier Limits (2025):**
| Resource | Limit | Our Usage |
|----------|-------|-----------|
| Database Size | 500 MB | < 1 MB |
| Bandwidth | 2 GB/month | < 100 MB/month |
| Monthly Active Users | 10,000 | < 10 |
| Projects | 2 | 1 |
| Inactivity Pause | 7 days | Prevent with ping |

**IMPORTANT:** Projects pause after 7 days of inactivity. Set up a weekly ping:
```yaml
# .github/workflows/ping-supabase.yml
name: Keep Supabase Alive
on:
  schedule:
    - cron: '0 0 * * 0'  # Every Sunday
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X GET "${{ secrets.SUPABASE_URL }}/rest/v1/user_progress?limit=1" -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}"
```

**Database Schema:**
```sql
-- Users' reading progress
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_days INTEGER[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data)
CREATE POLICY "Users can view own progress"
  ON user_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON user_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON user_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_progress_updated_at
  BEFORE UPDATE ON user_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**Authentication: Google OAuth**
- Sign in with existing Gmail account
- Same Google account = same progress across all devices
- No new password to remember
- One tap on iOS with Safari (saved Google session)
- Perfect for family/personal apps

---

## Part 2: Project Structure

```
bible-readings-v2/
├── public/
│   ├── data/
│   │   └── mcheyne.json         # Reading plan (static)
│   ├── icons/
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── manifest.json            # PWA manifest
│
├── src/
│   ├── main.js                  # Entry point
│   ├── app.js                   # Main app logic
│   │
│   ├── db/
│   │   ├── schema.js            # Dexie schema
│   │   └── queries.js           # DB operations
│   │
│   ├── sync/
│   │   ├── supabase.js          # Supabase client
│   │   ├── auth.js              # Auth helpers
│   │   ├── syncManager.js       # Sync coordination
│   │   └── syncQueue.js         # Offline queue
│   │
│   ├── ui/
│   │   ├── screens.js           # Screen navigation
│   │   └── components.js        # UI helpers
│   │
│   └── utils/
│       ├── date.js              # Date utilities
│       └── urlSync.js           # URL sync (fallback)
│
├── index.html
├── styles.css
├── vite.config.js
├── package.json
├── vercel.json
└── .env.example
```

---

## Part 3: Technology Choices

### 3.1 Build Tool: Vite

**Why Vite (not Next.js):**
| Factor | Vite | Next.js |
|--------|------|---------|
| Build Speed | < 1 second | 5-10 seconds |
| Bundle Size | ~5 KB runtime | ~80 KB runtime |
| Complexity | Low | High |
| PWA Plugin | Excellent (vite-plugin-pwa) | Manual |
| SSR Needed? | No | Overkill |

**vite.config.js:**
```javascript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Bible Reading Plan',
        short_name: 'Bible',
        theme_color: '#5b6c5d',
        background_color: '#faf9f7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: { maxAgeSeconds: 300 }
            }
          }
        ]
      }
    })
  ]
});
```

### 3.2 Offline Storage: Dexie.js (IndexedDB)

**Why Dexie (not raw IndexedDB):**
- Simple Promise-based API
- Works in service workers
- Automatic versioning/migrations
- Only 15 KB gzipped

**Schema:**
```javascript
import Dexie from 'dexie';

export const db = new Dexie('BibleReadingDB');

db.version(1).stores({
  state: 'id',                    // { id, startDate, userId, lastSync }
  completedDays: '++id, dayNumber, synced',  // { dayNumber, completedAt, synced }
  syncQueue: '++id, status'       // { operation, data, timestamp, status }
});
```

### 3.3 Keep URL Sync as Fallback

The existing URL-based sync is excellent for:
- Emergency backup
- Quick device transfer without account
- When Supabase is down
- Users who don't want cloud sync

**Keep this feature!**

---

## Part 4: Data Flow

### 4.1 Offline-First Pattern

```
USER ACTION (mark day complete)
         │
         ▼
┌─────────────────────┐
│ 1. Update IndexedDB │  ← Instant (optimistic)
│    (local state)    │
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ 2. Update UI        │  ← User sees change immediately
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ 3. Add to SyncQueue │  ← Queue for later
└─────────┬───────────┘
         │
         ▼
    ┌────┴────┐
    │ Online? │
    └────┬────┘
    Yes  │  No
         │   └──► Wait for online event
         ▼
┌─────────────────────┐
│ 4. Sync to Supabase │  ← Background sync
└─────────────────────┘
```

### 4.2 Sync Queue Implementation

```javascript
// syncQueue.js
class SyncQueue {
  async addToQueue(operation, data) {
    await db.syncQueue.add({
      operation,
      data,
      timestamp: Date.now(),
      status: 'pending',
      retries: 0
    });

    if (navigator.onLine) {
      this.processQueue();
    }
  }

  async processQueue() {
    const pending = await db.syncQueue
      .where('status').equals('pending')
      .toArray();

    for (const item of pending) {
      try {
        await this.syncToSupabase(item);
        await db.syncQueue.update(item.id, { status: 'completed' });
      } catch (error) {
        const retries = item.retries + 1;
        if (retries >= 5) {
          await db.syncQueue.update(item.id, { status: 'failed' });
        } else {
          await db.syncQueue.update(item.id, { retries });
        }
      }
    }
  }
}

// Listen for online events
window.addEventListener('online', () => syncQueue.processQueue());
```

### 4.3 Conflict Resolution

**Strategy: Last Write Wins (LWW)**

```javascript
async function mergeRemoteAndLocal(localDays, remoteDays) {
  const merged = new Map();

  // Add remote days
  remoteDays.forEach(day => {
    merged.set(day.dayNumber, day);
  });

  // Merge local days (keep newer)
  localDays.forEach(day => {
    const existing = merged.get(day.dayNumber);
    if (!existing || day.completedAt > existing.completedAt) {
      merged.set(day.dayNumber, day);
    }
  });

  return Array.from(merged.values());
}
```

---

## Part 5: Authentication (Google OAuth)

### 5.1 Why Google OAuth?

| Benefit | Description |
|---------|-------------|
| **Cross-device sync** | Same Gmail = same progress everywhere |
| **No new password** | Uses existing Google account |
| **One tap on iOS** | Safari remembers Google session |
| **Trusted auth** | Google handles security, 2FA, etc. |
| **User identity** | Get name/email for personalization |

### 5.2 Google Cloud Console Setup

**Step 1: Create a Google Cloud Project**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project: "Bible Reading Tracker"
3. Enable the Google+ API (for OAuth)

**Step 2: Configure OAuth Consent Screen**
1. APIs & Services → OAuth consent screen
2. User Type: **External**
3. App name: "Bible Reading Tracker"
4. User support email: your email
5. Authorized domains: Add your Vercel domain
6. Scopes: Just email and profile (defaults)
7. Test users: Add your wife's Gmail for testing

**Step 3: Create OAuth Credentials**
1. APIs & Services → Credentials
2. Create Credentials → OAuth client ID
3. Application type: **Web application**
4. Name: "Bible Reading PWA"
5. Authorized JavaScript origins:
   - `http://localhost:5173` (dev)
   - `https://your-app.vercel.app` (prod)
6. Authorized redirect URIs:
   - `http://localhost:5173/auth/callback`
   - `https://your-app.vercel.app/auth/callback`
   - `https://<your-project>.supabase.co/auth/v1/callback`
7. Copy **Client ID** and **Client Secret**

### 5.3 Supabase Google Auth Setup

**In Supabase Dashboard:**
1. Authentication → Providers → Google
2. Enable Google provider
3. Paste Client ID and Client Secret from Google
4. Copy the **Callback URL** shown (add to Google redirect URIs)

### 5.4 Auth Implementation

```javascript
// src/sync/auth.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Check if user is already signed in
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Sign in with Google
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        prompt: 'select_account'  // Always show account picker
      }
    }
  });

  if (error) throw error;
  return data;
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Listen for auth state changes
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// Get current user
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

### 5.5 Auth Callback Handler

```javascript
// src/auth/callback.js (or handle in main.js)
async function handleAuthCallback() {
  // Supabase handles the OAuth callback automatically
  // Just wait for the session to be established
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Auth callback error:', error);
    window.location.href = '/?error=auth_failed';
    return;
  }

  if (session) {
    // Redirect to main app
    window.location.href = '/';
  }
}
```

### 5.6 Login Screen UI

```html
<!-- Login screen shown when not authenticated -->
<div id="login-screen" class="screen">
  <div class="login-card">
    <h1>📖 Bible Reading</h1>
    <p>Sign in to sync your progress across all devices</p>

    <button id="google-signin-btn" class="btn-google">
      <svg><!-- Google G logo --></svg>
      Continue with Google
    </button>

    <p class="privacy-note">
      We only store your reading progress.<br>
      Your data is private and secure.
    </p>
  </div>
</div>
```

```css
/* Google sign-in button styling */
.btn-google {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 14px 24px;
  font-size: 1rem;
  font-weight: 500;
  color: #333;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-google:hover {
  background: #f8f8f8;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
```

### 5.7 App Flow with Auth

```
USER OPENS APP
      │
      ▼
┌─────────────────┐
│ Check Session   │
│ getSession()    │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Logged  │
    │  In?    │
    └────┬────┘
    No   │   Yes
     │   │    │
     ▼   │    ▼
┌────────┴─┐  ┌─────────────────┐
│ Show     │  │ Show Reading    │
│ Login    │  │ Screen          │
│ Screen   │  │ + Sync Progress │
└──────────┘  └─────────────────┘
      │
      │ Click "Sign in with Google"
      ▼
┌─────────────────┐
│ Google OAuth    │
│ Popup/Redirect  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Callback →      │
│ Session Created │
│ → Main App      │
└─────────────────┘
```

### 5.8 Security Notes

**RLS still protects data:**
- Each user can only access rows where `user_id = auth.uid()`
- Google OAuth provides verified user identity
- No way to access other users' data

**Privacy:**
- Only email and profile name accessed from Google
- No access to contacts, calendar, or other Google data
- User can revoke access anytime via Google account settings

---

## Part 6: Implementation Steps

### Phase 1: Setup (Day 1)

- [ ] Create new repository `bible-readings-v2`
- [ ] Initialize Vite project: `npm create vite@latest . -- --template vanilla`
- [ ] Install dependencies: `npm install @supabase/supabase-js dexie`
- [ ] Install dev deps: `npm install -D vite-plugin-pwa`
- [ ] Create Supabase project at [supabase.com](https://supabase.com)
- [ ] Run SQL schema migrations
- [ ] **Google OAuth Setup:**
  - [ ] Create Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com)
  - [ ] Configure OAuth consent screen (External, app name, scopes)
  - [ ] Create OAuth credentials (Web app, get Client ID + Secret)
  - [ ] Enable Google provider in Supabase Auth settings
  - [ ] Add Supabase callback URL to Google redirect URIs
- [ ] Create `.env.local` with Supabase keys

### Phase 2: Core Features (Days 2-3)

- [ ] Port existing UI (index.html, styles.css)
- [ ] Implement Dexie schema and migrations
- [ ] Implement Supabase client and auth
- [ ] Implement sync queue
- [ ] Update service worker with Workbox
- [ ] Test offline functionality

### Phase 3: Sync Logic (Days 4-5)

- [ ] Implement sync manager
- [ ] Implement conflict resolution
- [ ] Add online/offline detection
- [ ] Test cross-device sync
- [ ] Keep URL sync as fallback option

### Phase 4: Deploy (Day 6)

- [ ] Connect GitHub repo to Vercel
- [ ] Add environment variables in Vercel
- [ ] Configure vercel.json
- [ ] Deploy to production
- [ ] Test PWA installation

### Phase 5: Migration (Day 7)

- [ ] Add migration utility for existing users
- [ ] Migrate localStorage data to IndexedDB
- [ ] Initial sync to Supabase
- [ ] Update README with new instructions

---

## Part 7: Key Code Examples

### 7.1 Main App Entry

```javascript
// src/main.js
import { getSession, signInWithGoogle, onAuthStateChange } from './sync/auth.js';
import { db } from './db/schema.js';
import { SyncManager } from './sync/syncManager.js';
import { App } from './app.js';

async function init() {
  // 1. Check for existing Google session
  const session = await getSession();

  if (!session) {
    // Show login screen
    showLoginScreen();
    document.getElementById('google-signin-btn')
      .addEventListener('click', signInWithGoogle);
    return;
  }

  // 2. User is authenticated - start the app
  await startApp(session.user);
}

async function startApp(user) {
  // Hide login, show app
  hideLoginScreen();

  // Check for URL sync (migration/fallback)
  const urlState = checkUrlSync();
  if (urlState) {
    await importFromUrl(urlState);
  }

  // Initialize sync manager
  const syncManager = new SyncManager(user.id);
  await syncManager.pullRemoteChanges();

  // Initialize app
  const app = new App(syncManager);
  await app.init();
}

// Listen for auth changes (handles OAuth callback)
onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    startApp(session.user);
  } else if (event === 'SIGNED_OUT') {
    showLoginScreen();
  }
});

init().catch(console.error);
```

### 7.2 Marking Day Complete

```javascript
// src/app.js
async function handleComplete(dayNumber) {
  // 1. Optimistic local update
  await db.completedDays.add({
    dayNumber,
    completedAt: Date.now(),
    synced: false
  });

  // 2. Update UI immediately
  updateCompletionUI(true);
  showCelebration();

  // 3. Queue for sync
  await syncQueue.addToQueue('complete_day', { dayNumber });
}
```

### 7.3 Supabase CRUD

```javascript
// src/sync/supabase.js
export async function saveProgress(userId, startDate, completedDays) {
  const { data, error } = await supabase
    .from('user_progress')
    .upsert({
      user_id: userId,
      start_date: startDate,
      completed_days: completedDays
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getProgress(userId) {
  const { data, error } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
```

---

## Part 8: Testing Checklist

### Offline Testing
- [ ] App loads when offline
- [ ] Can mark days complete offline
- [ ] Changes sync when back online
- [ ] Service worker caches all assets
- [ ] IndexedDB persists across sessions

### Auth & Sync Testing
- [ ] Google sign-in button redirects to Google
- [ ] OAuth callback creates session
- [ ] User info (email, name) stored correctly
- [ ] Same Google account works on multiple devices
- [ ] Sign out clears session properly
- [ ] Progress saves to Supabase
- [ ] Progress loads from Supabase
- [ ] Conflicts resolved correctly
- [ ] Sync queue processes pending items

### PWA Testing
- [ ] Lighthouse PWA score > 90
- [ ] Install prompt works on iOS
- [ ] Install prompt works on Android
- [ ] Offline banner shows/hides correctly
- [ ] App icon appears correctly

### Cross-Device Testing
- [ ] Start on iPhone, continue on iPad
- [ ] Start on phone, continue on desktop
- [ ] URL sync fallback works
- [ ] No data loss between devices

---

## Part 9: Cost Summary

| Service | Free Tier | Expected Cost |
|---------|-----------|---------------|
| Vercel Hobby | 100 GB bandwidth | $0/month |
| Supabase Free | 500 MB database | $0/month |
| Total | - | **$0/month** |

**If you need to upgrade:**
- Vercel Pro: $20/month (commercial use)
- Supabase Pro: $25/month (no pausing, backups)

---

## Part 10: Future Enhancements

Once the base rebuild is complete, consider:

1. **Real-time Sync**
   - Supabase Realtime subscriptions
   - Instant cross-device updates
   - Live "reading together" feature?

2. **Reading Notes**
   - Add notes per day
   - Store in Supabase
   - Search through notes

3. **Multiple Reading Plans**
   - Add other plans (Chronological, etc.)
   - Let users switch plans
   - Track multiple concurrent plans

4. **Social Features**
   - Reading groups
   - Share progress
   - Accountability partners

---

## Quick Start Commands

```bash
# Clone and setup
git clone https://github.com/yourusername/bible-readings-v2
cd bible-readings-v2
npm install

# Create .env.local
cat > .env.local << EOF
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
EOF

# Development
npm run dev

# Build
npm run build

# Preview production build
npm run preview

# Deploy to Vercel
vercel --prod
```

---

## Sources

**Vercel:**
- [Vercel Hobby Plan Limits](https://vercel.com/docs/limits)
- [Vercel PWA Deployment](https://vite-pwa-org.netlify.app/deployment/vercel)

**Supabase:**
- [Supabase Free Tier](https://supabase.com/pricing)
- [Google OAuth with Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

**Google OAuth:**
- [Google Cloud Console](https://console.cloud.google.com)
- [OAuth 2.0 for Web Apps](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Configuring OAuth Consent](https://support.google.com/cloud/answer/10311615)

**Architecture:**
- [Offline-First PWA Patterns](https://web.dev/learn/pwa/offline-data/)
- [Workbox Caching Strategies](https://developer.chrome.com/docs/workbox/caching-strategies-overview)
- [Dexie.js Documentation](https://dexie.org/)

---

*Plan created: December 2024*
*Based on current Vercel and Supabase free tier offerings*
