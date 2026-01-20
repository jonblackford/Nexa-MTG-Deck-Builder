# Commander Deckbuilder (React + Supabase + GitHub Pages)

A Trello/Archidekt-style Commander deckbuilder:
- Multi-user auth (Supabase)
- Decks stored per account
- Drag/drop card organization into columns
- Scryfall-powered search + pricing
- Basic analytics (curve, pips, land/ramp/draw heuristics)
- Keyrune MTG set symbols (CDN)

## 1) Supabase setup

1. Create a Supabase project
2. In Supabase → SQL Editor, run:
   - `supabase/schema.sql`
3. In Supabase → Authentication → URL Configuration:
   - Site URL: your GitHub Pages URL (example: `https://YOURUSER.github.io/YOURREPO/`)
   - Redirect URLs: add the same URL

## 2) Local dev

```bash
npm install
cp .env.example .env.local
# edit .env.local with your Supabase values
npm run dev
```

## 3) Deploy to GitHub Pages

### A) Repo secrets (recommended)

In GitHub → Repo → Settings → Secrets and variables → Actions → **New repository secret**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### B) Enable Pages

GitHub → Repo → Settings → Pages:
- Source: **GitHub Actions**

Then push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys.

## Notes

- This project uses `HashRouter`, so refreshes on Pages don’t 404.
- Pricing is pulled from Scryfall’s card objects.
- Combo lookup is wired to Commander Spellbook’s backend endpoint; if it fails due to CORS, you can still copy the decklist and paste it into Commander Spellbook’s “Find My Combos”.
