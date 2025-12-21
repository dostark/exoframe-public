# ExoFrame Dashboard

## 🚀 Daemon Status

```dataview
TABLE WITHOUT ID
  "🟢 Running" as Status,
  file.mtime as "Last Activity"
FROM "System"
WHERE file.name = "daemon.pid"
```

## 🔍 Pending Plans

```dataview
TABLE
  status as Status,
  created as Created,
  agent as Agent
FROM "Inbox/Plans"
WHERE status = "review"
SORT created DESC
```

## 📝 Recent Activity

```dataview
TABLE
  Action,
  Actor,
  Target,
  Timestamp
FROM "System/activity_export.md"
SORT Timestamp DESC
LIMIT 20
```

## 🌐 Active Portals

```dataview
TABLE
  target as Target,
  status as Status
FROM "Knowledge/Portals"
SORT file.name ASC
```

---
*Tip: Use `exoctl plan approve <id>` to execute a plan.*
