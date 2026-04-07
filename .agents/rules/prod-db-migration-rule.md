---
trigger: always_on
---

Whenever you make a change that requires a database update (schema, RLS, or stored procedures), you MUST first create a corresponding SQL migration file in server/migrations/ with the current date, and then apply it to the development database.