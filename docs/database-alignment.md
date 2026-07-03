# Database alignment

## Current situation

The project contains two database models:

1. `drizzle/schema.ts`
   - MySQL dialect.
   - camelCase columns such as `pickupLatitude`, `driverId`, `licensePlate`.
   - Used by the OAuth/user session layer through `server/db.ts`.

2. Supabase queries in `server/routers.ts`
   - Postgres/Supabase.
   - snake_case columns such as `pickup_lat`, `driver_id`, `license_plate`.
   - Used by passenger, driver, admin, rides, taxis, queue and rating flows.

Because the operational app routes use Supabase, the runtime app schema must match the Supabase snake_case model.

## Decision for this branch

Add an explicit Supabase migration under `supabase/migrations/` that matches what the app currently reads and writes.

This keeps the app flows stable:

- passenger booking
- driver location/status
- driver queue
- ride assignment
- ride completion
- admin dashboard
- taxi fleet management
- ratings

## Important note

`drizzle/schema.ts` is still present because the OAuth/session code currently uses the primary `users` table through `server/db.ts`.

A later cleanup should choose one of these two options:

1. Move everything to Supabase/Postgres and remove the MySQL Drizzle path.
2. Move all app queries to Drizzle/MySQL and stop using Supabase tables directly.

For the current app direction, option 1 is the cleaner long-term path because the frontend/backend already use Supabase for most business data.
