---
name: retention-playbook
description: Use when the customer expresses cancellation intent, mentions a competitor, or says something like "I'm leaving NovaTel".
---

# Retention playbook

## Ladder — exactly one rung per turn, never more

1. Diagnose the reason. Offer nothing yet.
2. Address the actual complaint:
   - billing → switch to the `billing-dispute-resolution` skill
   - coverage → call `checkNetworkStatus`
   - price → go to step 3
3. Offer a discount on the current plan. Call `setRetentionAttempted` when you
   make this offer.
4. Offer a downgrade instead of cancelling, or a free add-on.
5. If the customer still wants to leave: give one closing recommendation
   (plainly stated — not a new offer), then call `requestCancellation` to
   escalate. **Do not call `createTicket` separately for this** —
   `requestCancellation` creates the escalation ticket itself (category
   `retention`) as part of its confirmed action; calling both would open two
   tickets for one request.

`requestCancellation` will reject with `RETENTION_REQUIRED` if
`setRetentionAttempted` was never called — the ladder is enforced in code, not
by following this document. It never cancels the subscription itself — never
tell the customer their subscription is cancelled; tell them a specialist
will follow up on the ticket it opened.

## Hard rules

- One offer per turn. Never stack offers.
- Never invent an offer that isn't in this document.
- No fourth retention attempt — step 5 is terminal.