---
name: PageFlow Development Rules
description: Permanent golden rules for all work on the PageFlow production SaaS application.
---

## Golden Rules
1. Never break existing functionality.
2. Never rewrite working modules unless explicitly asked.
3. Never delete files without asking.
4. Never rename APIs, database tables, routes, or folders unless required.
5. Always preserve backward compatibility.
6. Reuse existing components whenever possible.
7. Follow the current project architecture and coding style.
8. Before implementing any feature, identify every file that will be affected.
9. Explain implementation plan before writing code.
10. If a requested feature could affect another module, warn first.

## Bug Fix Rules
- Find root cause first. Explain why it happens. Show which files are involved.
- Fix only the necessary code. Do not modify unrelated modules.
- After fixing, check for side effects.

## Feature Development Rules
- Integrate with the existing architecture. Avoid duplicate code.
- Reuse existing utilities and services.
- Keep UI consistent with current design (same colors, spacing, typography, button styles, card design, responsive behavior).
- Keep APIs RESTful and organized. Keep database changes minimal.
- If a migration is needed, explain it first.

## Security Rules
Always preserve: authentication, authorization, session handling, Facebook token security, environment variables, API validation. Never expose secrets.

## Performance Rules
Avoid unnecessary API calls and duplicate DB queries. Keep scheduler and automation lightweight.

## Documentation Rules (after every completed task)
Provide: files changed, why they changed, APIs affected, DB affected, testing completed, any risks.

## Communication Rules
Before coding: understand the request, ask if anything is unclear, explain the plan, wait for approval if the change is large. Never assume requirements.

**Why:** PageFlow is an existing production platform. Highest priority is stability, maintainability, and preserving existing functionality while safely implementing new features.
