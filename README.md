# doceditor

A full-stack document editing platform built to demonstrate end-to-end product engineering — from PDF canvas rendering and OAuth auth flows to version-controlled editing and cloud deployment.

Live → **[editify-doc.vercel.app](https://editify-doc.vercel.app)**  
Demo video → **[youtu.be/RSpd6eAYNwQ](https://youtu.be/RSpd6eAYNwQ)**

---

## What it does

Upload a PDF, DOCX, or TXT file. Click any text on the page to edit it inline. Save versions as you go. Download the modified document. Every change is tracked, diffable, and tied to your Google account.

---

## Features

- **Visual PDF editing** — PDF pages render to an HTML canvas via pdf.js. Clicking a word opens an inline input positioned pixel-perfectly over the original text using viewport coordinate transforms. Edits composite back onto the canvas without re-rendering the page.
- **New line insertion** — Click any blank area on a PDF page to place a new text line at that exact position. Lines persist across saves and are composited at both edit-time and export-time.
- **DOCX & TXT editing** — Rich text editing via TipTap (ProseMirror) with typography and highlight extensions.
- **Version history** — Every save creates a numbered, labelled version stored in Supabase. Any version can be restored at any time.
- **Diff view** — Side-by-side diff between any two document versions, highlighting additions and deletions.
- **Export** — Download the edited document as PDF (canvas → jsPDF), DOCX (html-to-docx), or TXT.
- **Google OAuth** — One-click sign-in via Supabase Auth + Google OAuth 2.0. Sessions persist across reloads.
- **Per-user document library** — Dashboard showing all uploaded documents, scoped to the authenticated user via Supabase Row Level Security.
- **PDF cloud storage** — PDF bytes are stored in Supabase Storage and fetched on revisit so edits survive page refreshes without re-uploading.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion + Magic UI |
| Rich text | TipTap (ProseMirror) |
| PDF rendering | pdf.js (pdfjs-dist v6) |
| PDF export | jsPDF |
| DOCX parsing | Mammoth.js |
| DOCX export | html-to-docx |
| Auth | Supabase Auth + Google OAuth 2.0 |
| Database | Supabase (PostgreSQL + RLS) |
| File storage | Supabase Storage |
| Deployment | Vercel |

---

## Architecture highlights

**PDF editing without reflow**
Standard editors reflow text when you edit, which breaks layouts. Here the original PDF is rendered once to an offscreen canvas (baked), then edits are composited on top using `ctx.drawImage()` from the snapshot. Re-renders are instant and the layout stays pixel-faithful to the original.

**Coordinate mapping**
pdf.js exposes text item positions in PDF user space (origin bottom-left). These map to screen coordinates via `viewport.convertToViewportPoint()` so the edit input appears exactly over the original glyph, accounting for scale and coordinate system flip.

**Version content as a JSON envelope**
PDF state can't be stored as plain HTML. The app wraps version content in a discriminated envelope `{ __pdf__: true, html, edits, addedLines }` so the same database column stores both rich text (HTML strings) and PDF state (edit maps + added line arrays) without a schema change.

**Row Level Security**
All Supabase queries are protected by RLS policies — `documents` rows are accessible only when `auth.uid() = user_id`. Version access is gated by a join back to the parent document's owner. No server-side auth middleware or API routes needed.

---

## Local setup

```bash
git clone https://github.com/gouthamfitnsetdev/doc_edit_version_handler
cd doc_edit_version_handler
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run the SQL in `supabase-setup.sql` in your Supabase SQL editor, enable Google OAuth in Supabase Auth settings, then:

```bash
npm run dev
```

---

## Database schema

```sql
documents (id, name, file_type, user_id, created_at)
versions  (id, document_id, version_number, content, label, created_at)
```

Storage bucket: `pdf-files` — one object per document, keyed by document ID.

