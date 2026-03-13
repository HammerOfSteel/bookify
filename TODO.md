# Bookify TODO

## Done

- Bootstrap Next.js + TypeScript + Tailwind project structure.
- Add PostgreSQL-ready Prisma schema for users, audiobooks, ebooks, and chapters.
- Add credentials auth with `ADMIN` and `USER` roles.
- Add Docker Compose development workflow.
- Add seed users for admin and user login.
- Build the main dashboard, admin views, and creation/edit flows.
- Wire up file uploads and draft-saving forms for audiobooks and ebooks.
- Add generation actions for EPUB, MP3, and MP4 outputs.
- Validate the scaffold with `npm run lint` and `npm run build`.

## In progress

- End-to-end runtime verification with a live PostgreSQL database and media files.
- Usability polish for validation errors and creation flows.

## Next

- Add richer chapter progress indicators and validation feedback.
- Add searchable library views, filters, and project statuses.
- Add generated asset history, download analytics, and cleanup tools.
- Add cover design presets and ebook typography themes.
- Add background jobs for large media generation.
- Add automated tests and CI.