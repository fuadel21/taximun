# Stripe Connect webhooks

Configure the existing Stripe webhook endpoint to also receive Connect events:

- `account.updated`
- `transfer.created`
- `transfer.updated`
- `transfer.failed`
- `transfer.reversed`

Endpoint:

`POST /api/webhooks/stripe`

The endpoint keeps the existing signature verification, audit log and idempotent event processing. Connect account restrictions, payout availability and transfer failures/reversals are synchronized into Supabase.
