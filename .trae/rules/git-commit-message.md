---
alwaysApply: true
scene: git_message
---

Follow the Conventional Commits specification strictly.

Format: `<type>(<scope>): <short description>`

- type: feat | fix | refactor | chore | docs | style | test | perf
- scope: optional, one word
- description: imperative mood, lowercase, no period, 50 chars max
- one line only, no body, no footer
- breaking change: add `!` after type (`feat!: ...`)
- no bullet points, no markdown, no explanations
