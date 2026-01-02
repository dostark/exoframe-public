# ExoFrame Dashboard

---

## 📨 Pending Requests

```dataview
TABLE
  trace_id as "Trace",
  status as "Status",
  priority as "Priority",
  agent as "Agent",
  created as "Created"
FROM "Inbox/Requests"
WHERE status = "pending"
SORT created DESC
LIMIT 20
```

---

## 🚀 Daemon Status

Tip: daemon PID file is tracked at `System/daemon.pid`.

---

## 🔍 Pending Plans

```dataview
TABLE
  status as Status,
  created as Created,
  agent as Agent
FROM "Inbox/Plans"
WHERE status = "review"
SORT created DESC
LIMIT 20
```

---

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

---

## 🌐 Active Portals

```dataview
TABLE
  target as Target,
  status as Status
FROM "Knowledge/Portals"
SORT file.name ASC
LIMIT 50
```

## 🔗 Quick Links

- [[README]]
- [[templates/README]]

Tip: Use `exoctl plan approve <id>` to execute a plan.
