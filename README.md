# Cloudflare Offline Active Reply Template

This folder is a Cloudflare Worker template for the offline active-reply feature.

After deployment, the user gets a Worker URL like:

```txt
https://offline-active-reply.your-subdomain.workers.dev
```

That URL should be pasted into the frontend Settings app -> `system` -> Offline Message card.

## What this template does
- stores push subscriptions
- stores contact active-reply config
- stores the latest message snapshot for each contact
- runs a scheduled check every minute
- generates offline messages based on `activeReplyEnabled + activeReplyInterval`
- lets the frontend sync backend-generated messages later

## Files users should keep in their Cloudflare template repo
- `wrangler.toml`
- `schema.sql`
- `src/index.js`
- `README.md`

## Deploy steps
1. Install `wrangler`
2. Create a D1 database
3. Put the returned `database_id` into `wrangler.toml`
4. Run:

```bash
wrangler d1 execute offline-active-reply-db --file=./schema.sql
```

5. Deploy:

```bash
wrangler deploy
```

## Frontend config
Use the Worker URL as `apiBaseUrl`.

```js
window.iphoneSimState.offlinePushSync = {
  enabled: true,
  apiBaseUrl: 'https://offline-active-reply.your-subdomain.workers.dev',
  userId: 'user-001',
  disableLocalActiveReplyScheduler: true
};
```

## Important note
This version already supports:
- backend offline message generation
- syncing when the user comes back to the page

This version does not fully support yet:
- true instant Web Push when the webpage is fully closed
