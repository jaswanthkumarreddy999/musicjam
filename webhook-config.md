# GitHub Webhook Configuration for Render

## Webhook Settings for MusicJam CI/CD

### 1. Payload URL
Get this from Render Dashboard → Service → Settings → Build & Deploy → Deploy Hook:
```
https://api.render.com/deploy/srv-[YOUR-SERVICE-ID]?key=[YOUR-DEPLOY-KEY]
```

### 2. Content Type
```
application/json
```

### 3. Secret
```
(Leave empty - Render handles authentication via the deploy key)
```

### 4. SSL Verification
```
✅ Enable SSL verification
```

### 5. Events to trigger webhook
```
✅ Just the push event
```
OR for more control:
```
🔘 Let me select individual events
  ✅ Pushes
  ✅ Pull requests (merged)
  ❌ Issues, Wiki, etc. (not needed)
```

### 6. Active
```
✅ Active
```

## Webhook Payload Example

When triggered, GitHub will send:
```json
{
  "ref": "refs/heads/main",
  "repository": {
    "name": "musicjam",
    "full_name": "jaswanthkumarreddy999/musicjam"
  },
  "pusher": {
    "name": "username"
  },
  "head_commit": {
    "id": "commit-hash",
    "message": "commit message"
  }
}
```

## Testing the Webhook

1. **Add webhook** in GitHub
2. **Make a small change** to your code
3. **Push to main branch**:
   ```bash
   git add .
   git commit -m "test webhook deployment"
   git push
   ```
4. **Check Render dashboard** for new deployment
5. **Verify webhook** in GitHub → Settings → Webhooks (should show green checkmark)

## Troubleshooting

### If webhook fails:
1. **Check the Deploy Hook URL** is correct
2. **Verify Content-Type** is application/json
3. **Check Recent Deliveries** in GitHub webhook settings
4. **Look at Render deployment logs** for errors

### If auto-deploy isn't working:
1. **Disconnect and reconnect** GitHub in Render
2. **Check repository permissions** for Render app
3. **Verify branch name** is correct (main vs master)
4. **Check webhook exists** in GitHub → Settings → Webhooks