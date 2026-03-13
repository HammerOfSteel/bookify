# Bookify

Bookify is a TypeScript publishing workspace for creating and managing audiobooks and ebooks with role-based access control, draft workflows, and built-in generation tools.

## Features

- Next.js App Router + TypeScript + Tailwind CSS v4 UI
- Credentials authentication with NextAuth (`ADMIN` and `USER` roles)
- Admin user management (`/admin/users`)
- Audiobook workflow:
	- chapter editor with optional prologue/epilogue
	- filename-based batch mapping (`chapter_1`, `prologue`, `epilogue`)
	- staged file-by-file audio upload with MP3 conversion
	- draft save and generate actions with progress feedback
	- generated MP3 or cover-video MP4 output + timestamps
- Ebook workflow:
	- chapter editor
	- EPUB generation
- PostgreSQL with Prisma
- Docker Compose development environment

## Tech stack

- Next.js 16 + React 19
- Prisma + PostgreSQL
- NextAuth (credentials provider)
- FFmpeg / ffprobe for audio-video processing
- epub-gen for ebook exports

## Quick start (Docker)

1. Copy env file:

```bash
cp .env.example .env
```

2. Start services:

```bash
docker compose up --build
```

3. Open app:

`http://localhost:3000`

### Default seeded users

- Admin: `admin@bookify.com` / `admin123`
- User: `user@bookify.com` / `user123`

## Running locally (without Docker)

Prerequisites:

- Node.js 22+
- PostgreSQL running
- `ffmpeg` and `ffprobe` installed

Commands:

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

## Storage layout

- Uploaded assets: `public/storage/uploads/**`
- Generated outputs: `public/storage/generated/**`

## Important behavior

- Metadata fields expect valid JSON.
- Audio files selected in audiobook forms are staged and converted to MP3 before final draft/generate submit.
- The app shows upload/submit progress in the audiobook flow.

## Troubleshooting

- `Body exceeded ... limit`: restart the web service after config changes.
- Hydration warnings with `data-np-intersection-state`: usually caused by browser password manager extensions (for example NordPass) modifying DOM attributes.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build production app
- `npm run start` - Start production server
- `npm run lint` - Run lint checks
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push Prisma schema to DB
- `npm run db:seed` - Seed default users
