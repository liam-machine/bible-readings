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
| No auth | Anonymous auth (seamless) |
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
│   │  (Anonymous)  │   │   Database   │   │  Policies    │  │
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

**Authentication: Anonymous Sign-In**
- No email/password required
- User gets unique ID instantly
- Can upgrade to email later if desired
- Perfect for personal tracker apps

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

## Part 5: Authentication

### 5.1 Anonymous Auth Flow

```javascript
// auth.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export async function initAuth() {
  // Check for existing session
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    return session.user;
  }

  // Create anonymous user
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;

  return data.user;
}

// Optional: Upgrade to email later
export async function upgradeAccount(email, password) {
  return supabase.auth.updateUser({ email, password });
}
```

### 5.2 Security

**RLS protects data even with exposed anon key:**
- Each user can only access their own data
- Auth UID verified server-side
- No admin operations possible with anon key

**Enable CAPTCHA for anonymous sign-ins:**
- Supabase Dashboard → Auth → Providers
- Enable Cloudflare Turnstile or hCaptcha
- Prevents abuse

---

## Part 6: Implementation Steps

### Phase 1: Setup (Day 1)

- [ ] Create new repository `bible-readings-v2`
- [ ] Initialize Vite project: `npm create vite@latest . -- --template vanilla`
- [ ] Install dependencies: `npm install @supabase/supabase-js dexie`
- [ ] Install dev deps: `npm install -D vite-plugin-pwa`
- [ ] Create Supabase project at [supabase.com](https://supabase.com)
- [ ] Run SQL schema migrations
- [ ] Enable anonymous auth + CAPTCHA
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
import { initAuth } from './sync/auth.js';
import { db } from './db/schema.js';
import { SyncManager } from './sync/syncManager.js';
import { App } from './app.js';

async function init() {
  // 1. Initialize auth
  const user = await initAuth();

  // 2. Check for URL sync (migration/fallback)
  const urlState = checkUrlSync();
  if (urlState) {
    await importFromUrl(urlState);
  }

  // 3. Initialize sync manager
  const syncManager = new SyncManager(user.id);
  await syncManager.pullRemoteChanges();

  // 4. Initialize app
  const app = new App(syncManager);
  await app.init();
}

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

### Sync Testing
- [ ] Anonymous auth creates user
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

1. **Email Account Upgrade**
   - Let users upgrade anonymous → email
   - Adds password recovery
   - More permanent identity

2. **Real-time Sync**
   - Supabase Realtime subscriptions
   - Instant cross-device updates
   - Live "reading together" feature?

3. **Reading Notes**
   - Add notes per day
   - Store in Supabase
   - Search through notes

4. **Multiple Reading Plans**
   - Add other plans (Chronological, etc.)
   - Let users switch plans
   - Track multiple concurrent plans

5. **Social Features**
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
- [Anonymous Auth Docs](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

**Architecture:**
- [Offline-First PWA Patterns](https://web.dev/learn/pwa/offline-data/)
- [Workbox Caching Strategies](https://developer.chrome.com/docs/workbox/caching-strategies-overview)
- [Dexie.js Documentation](https://dexie.org/)

---

*Plan created: December 2024*
*Based on current Vercel and Supabase free tier offerings*
