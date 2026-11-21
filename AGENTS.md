# Architecture rules

- Keep authentication scene colors scoped to the auth-page root via CSS variables, with presentation state separate from authentication handlers, so other routes and account behavior remain unchanged.