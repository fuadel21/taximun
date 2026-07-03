# Auth security constraints

Taximun currently signs users in through OAuth. The form stores the selected role only as a pending preference until the callback finishes.

Role changes must be checked by the server. The admin role should only be available to accounts already authorised by backend configuration.
