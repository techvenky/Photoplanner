# PhotoPlanner — Claude Code Guidelines

## Commit Rules

**NEVER commit changes without explicit user approval.**
Always show a summary of what will be committed and wait for the user to say "yes, commit" or similar before running `git commit`.

## Project Structure

- `app.js` — main app entry point
- `js/` — feature modules (calculators, celestial, compass, target)
- `templates/` — HTML template source files (edit these, not `js/templates/`)
- `index.html` — app shell
- `manifest.json` — PWA manifest

## Coding Standards

### General
- Use **vanilla JavaScript** — no frameworks unless already in the project
- Use `const` by default; `let` only when reassignment is needed; never `var`
- Prefer arrow functions for callbacks; use named functions for top-level declarations
- Keep functions small and single-purpose
- Use descriptive variable names — avoid single-letter names outside of loop counters

### Naming
- Variables and functions: `camelCase`
- Constants (module-level, truly fixed): `UPPER_SNAKE_CASE`
- Files: `kebab-case` (existing files are `camelCase` — match the surrounding convention)

### Formatting
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

### Comments
- Add comments only where the logic is non-obvious (math, coordinate transforms, astronomy calculations)
- Do not add JSDoc to every function — only public API surface or complex algorithms
- Remove commented-out dead code before committing

### DOM / Browser
- Avoid inline event handlers in HTML; attach listeners in JS
- Use `querySelector`/`querySelectorAll` over `getElementById` for consistency
- Guard canvas/WebGL operations with existence checks before use

### Error Handling
- Validate at system boundaries: geolocation, external APIs, user input
- Log errors with `console.error` and provide a user-visible fallback where appropriate
- Do not swallow errors silently

## File-Specific Notes

- **`js/celestial.js`** — astronomy math; preserve precision; cite formula sources in comments
- **`js/calculators.js`** — unit conversions and optics; keep pure (no DOM side effects)
- **`js/compass.js` / `js/target.js`** — canvas rendering; use `requestAnimationFrame` for animation loops
- **`templates/`** — edit source HTML here; the build step generates `js/templates/`

## What NOT to Do

- Do not commit `node_modules/`, `dist/`, `js/templates/`, `.env`, or `*.local.*` files
- Do not introduce new npm dependencies without discussion
- Do not break the offline/PWA behaviour
- Do not minify or bundle manually — use the existing build script
