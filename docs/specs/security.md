# Spec: Security

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Security

There's no sign-in, so the app relies on being reachable only from this computer:

- The backend and Vite listen on the local machine only.
- No cross-origin access is allowed, and the backend's trusted host check accepts only `localhost` and `127.0.0.1`. This stops other websites in the same browser from reading or changing customer data.
- The same goes for Vite, because it's the address the browser uses and it sits in front of the backend. Its CORS support is off, since by default it trusts pages on other local ports, and it serves only `frontend/` and the packages, since by default it serves the whole repo, database included.
- The API accepts only JSON request bodies.
- Website links must be `http` or `https`, so a saved value can't run a script when clicked.
- The database file stays out of git, which `.gitignore` already handles.
