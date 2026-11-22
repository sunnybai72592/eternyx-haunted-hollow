# Architecture rules

- Keep authentication scene colors scoped to the auth-page root via CSS variables, with presentation state separate from authentication handlers, so other routes and account behavior remain unchanged.
- Generate lamp switch audio locally with Web Audio only after interaction, and keep mute and audio failures independent of lamp operation, so sound needs no external service or autoplay permission.