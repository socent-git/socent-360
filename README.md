# SocEnt 360

the^delta's 360° view of every organisation it supports: Overview, Impact, Organisations (full profiles with history), Settings and Import data.

| Where | What lives there |
|---|---|
| **GitHub** | This whole repository: the app code, the database set-up SQL, this README. Never commit `.env.local` or the service-role key. |
| **Supabase** | The database (all organisation data), sign-in (email links, optional Google), live updates between users, and the role rules that decide who can see and change what. |
| **Vercel** | Builds this repository and hosts the website. Holds two public settings: the Supabase URL and anon key. |

```
socent360/
├─ index.html                 page shell, fonts
├─ src/
│  ├─ main.js                 entry point
│  ├─ styles.css              the^delta brand styles
│  ├─ platform/
│  │  ├─ bootstrap.js         sign-in, "waiting for access", start-up
│  │  └─ supabase.js          records, live updates, people and roles, downloads
│  └─ app/                    the app itself (joined in order by vite.config.js)
│     ├─ core.js              helpers, reference lists, calculations, data checks
│     ├─ data.js              loading, saving with history, publishing Overview figures, export
│     ├─ ui.js                dialogs, tables, charts, India map
│     ├─ pages1.js            header, Overview, Impact
│     ├─ pages2.js            Organisations list
│     ├─ pages2b.js           Organisation profile (sections 1–11)
│     ├─ pages3.js            Settings
│     └─ pages4.js            Import data
├─ supabase/migrations/0001_socent360.sql   tables, roles, security rules, live updates, reporting views
├─ scripts/restore-backup.mjs               load a backup JSON into Supabase
├─ vercel.json  vite.config.js  package.json  .env.example
```

---

## 1. Supabase (database and sign-in) · about 15 minutes

1. Create a project at [supabase.com](https://supabase.com). Choose the **Mumbai (ap-south-1)** region so data stays in India and pages load fast.
2. Open **SQL Editor › New query**, paste all of `supabase/migrations/0001_socent360.sql`, and run it. It is safe to run again later.
3. **Authentication › Sign In / Providers**: keep **Email** on. Turn **Confirm email** on.
4. **Authentication › URL Configuration** (fill in after step 3 when you know the Vercel address):
   - **Site URL**: `https://socent360.vercel.app` (your production address)
   - **Redirect URLs**: add `https://socent360.vercel.app/**`, `https://*-YOUR-VERCEL-TEAM.vercel.app/**` (preview deployments) and `http://localhost:5173/**`
5. **Authentication › Emails › SMTP Settings**: connect your own email sender (Google Workspace, SendGrid, Resend, etc.). Supabase's built-in sender is limited to a few emails an hour and is meant for testing only; sign-in links will stop arriving without this.
6. Optional, Google sign-in: **Authentication › Providers › Google**, add the client ID and secret from Google Cloud, then set `VITE_ENABLE_GOOGLE_LOGIN=true` in Vercel.
7. **Project Settings › API**: copy the **Project URL** and the **anon public** key for the next steps.

**Who gets in.** The first person to sign in becomes Admin. Everyone after that waits for access until an Admin chooses their role in **Settings › Users and roles**. To let a whole email domain in as view-only automatically, add it under **Automatic access** on the same page.

## 2. Run it on your computer (optional)

Needs Node.js 20.19 or later.

```bash
npm install
cp .env.example .env.local      # then paste the Project URL and anon key
npm run dev                     # opens http://localhost:5173
```

## 3. GitHub

```bash
git init
git add .
git commit -m "SocEnt 360 phase 1"
git branch -M main
git remote add origin https://github.com/YOUR-ORG/socent360.git
git push -u origin main
```

Make the repository **private**.

## 4. Vercel (hosting)

1. [vercel.com](https://vercel.com) › **Add New › Project** › import the GitHub repository. Vercel detects Vite; leave the build settings as they are (`vercel.json` sets them).
2. **Environment Variables** (all environments):
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon public key
   - `VITE_ENABLE_GOOGLE_LOGIN` = `false` (or `true` after step 1.6)
3. **Deploy**. Then put the production address into Supabase (step 1.4).
4. Optional: **Settings › Domains** to use `socent360.thedelta.org`. Add that address to Supabase's Site URL and Redirect URLs too.

Every push to `main` redeploys automatically; other branches get preview addresses.

## 5. First use

1. Open the site, sign in with your email. You are the Admin.
2. **Settings › Programmes and cohorts** › **Add the six programmes**, then add the cohorts. Under each cohort's **Other labels**, enter every way the source sheets name it (`N/7`, `Cohort 7`, `Inc-7`).
3. **Settings › Import data**: load the Contact List, then Key Metrics 2025, then Catalysts for Change, then Sattva and Deloitte findings. Review conflicts before each import.
4. **Settings › Data checks** to see possible duplicates and figures to look at.
5. Ask colleagues to sign in, then give each a role in **Settings › Users and roles**.

## Moving data from the claude.ai version

In the claude.ai version: **Settings › Organisation records › Export full backup (JSON)**. Then, on your computer:

```bash
SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY \
npm run restore -- path/to/socent360-backup.json
```

The service-role key (Project Settings › API) bypasses all security rules. Use it only on your own computer; never put it in Vercel, GitHub or the browser.

## How access is protected

The rules live in the database (row-level security in the SQL file), so they hold even if someone calls the database directly:

| Role | Reads | Changes |
|---|---|---|
| Admin | everything | everything |
| Program Team | everything | identity, people, notes, follow-ups, support, document links, participation status (`edit/*`) and the published Overview figures (`pub/*`) |
| Viewer | only the published Overview and Impact figures (`pub/*`): names and totals, no contacts or finances | nothing |
| Waiting | nothing | nothing |

Organisation records are stored as JSON in one table, `public.docs`, keyed by a path (`orgs/<id>`, `edit/<id>`, `cohorts/<id>`, `config/...`, `pub/...`). For SQL analysis use the views `v_organisations`, `v_grants` and `v_impact`.

## Backups

- Supabase Pro takes daily backups (Database › Backups). On the free plan, export a backup from **Settings › Organisation records** regularly and keep it somewhere safe (not in this repository).
- Every change inside SocEnt 360 also keeps the old value in the organisation's update history.

## Troubleshooting

| What you see | What to do |
|---|---|
| "Set-up needed" | The two `VITE_SUPABASE_*` variables are missing in Vercel or `.env.local`. Add them and redeploy. |
| The sign-in email never arrives | Connect your own SMTP sender (step 1.5); check spam. |
| The sign-in link opens a page that says it didn't work | The site's address isn't in Supabase's Redirect URLs (step 1.4), or the link was used twice. |
| "Waiting for access" | An Admin needs to choose a role for you in Settings › Users and roles. |
| A change says "You don't have permission" | Your role can't change that section; an Admin can. |
| Overview numbers look out of date for viewers | An Admin or Program Team member opening the app re-publishes them within a few seconds. |

Dependencies are pinned: Vite 8.3.6, supabase-js 2.119.0 and SheetJS 0.20.3 (installed from SheetJS's official CDN, as SheetJS recommends; the npm copy is outdated).
