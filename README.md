# Offline Active Reply Backend Template

This folder is the backend template that each user can deploy to Railway.

After deployment, Railway gives the user a public backend URL such as:

```txt
https://your-app.up.railway.app
```

That URL should be pasted into the frontend Settings app -> `system` -> Offline Message card.

## What this backend does
- stores active-reply config for contacts
- stores the latest message snapshot for each contact
- checks on a timer whether a contact should proactively message
- generates offline messages and stores them
- lets the frontend sync those messages later

## API endpoints
- `GET /health`
- `POST /api/push/subscribe`
- `POST /api/contacts`
- `GET /api/contacts/active-reply-config?userId=...`
- `POST /api/messages/snapshot`
- `POST /api/messages/sync`
- `POST /api/messages/mark-read`
- `POST /api/debug/trigger-active-reply`

## Files users should keep in their backend repo
- `package.json`
- `server.js`
- `.gitignore`
- `.env.example`
- `README.md`

## Local run
```bash
npm install
npm start
```

Default port is `3000`.

## Environment variables
- `PORT` is provided by Railway automatically
- `APP_ORIGIN` is the frontend site URL; during setup you can temporarily use `*`
- `CRON_INTERVAL_MS` defaults to `60000`
- `DATA_DIR` defaults to `./data`
- `DB_PATH` defaults to `./data/offline-active-reply.db`

## Railway deployment steps
1. Put these backend files in a GitHub repo
2. Open Railway
3. Create a new project
4. Choose `Deploy from GitHub repo`
5. Select that backend repo
6. Railway will detect `package.json` and run `npm start`
7. Set variables in Railway:
   - `APP_ORIGIN=https://your-frontend-site.com`
   - optional `CRON_INTERVAL_MS=60000`
8. After deployment, copy the public Railway URL
9. Paste that URL into the frontend Offline Message settings panel

## Important note
This version solves:
- offline message generation on the backend
- syncing messages when the user returns to the page

This version does not yet fully solve:
- true instant Web Push when the webpage is fully closed

## Suggested frontend config
```js
window.iphoneSimState.offlinePushSync = {
  enabled: true,
  apiBaseUrl: 'https://your-app.up.railway.app',
  userId: 'user-001',
  disableLocalActiveReplyScheduler: true
};
```
