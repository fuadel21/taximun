# Auth role flow summary

This branch connects the UI role selector with the authenticated session flow.

## Flow

1. The user selects passenger, driver, or admin in `Auth.tsx`.
2. The selected role, language, and phone number are saved temporarily in local storage.
3. The app redirects to OAuth.
4. OAuth redirects back to `/`.
5. `Home.tsx` reads the pending role and calls `auth.setRole`.
6. The app redirects to the correct panel.

## Routes

- Passenger: `/passenger`
- Driver: `/driver`
- Admin: `/admin`

## Note

The admin role should remain restricted by server-side authorization and owner configuration.
