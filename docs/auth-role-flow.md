# Auth role flow

Taximun uses OAuth for secure sign-in. The role selected in the UI is stored temporarily in `localStorage` before redirecting to OAuth.

After OAuth redirects back to `/`, `Home.tsx` reads the pending role and calls `auth.setRole` before sending the user to the correct panel:

- `passenger` -> `/passenger`
- `driver` -> `/driver`
- `admin` -> `/admin`

The selected role is persisted in the primary user store used by `auth.me`, so future redirects use the saved role instead of defaulting to passenger.

Admin access must remain restricted to accounts already authorised by the backend owner/admin configuration.
