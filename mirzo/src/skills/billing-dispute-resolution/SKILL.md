---
name: billing-dispute-resolution
description: Use when the customer reports an unexpected charge, a bill higher than usual, a double charge, or disputes a specific line item.
---

# Billing dispute resolution

## Diagnostic order (mandatory, in this sequence)

1. Compare the current invoice against the prior one with `compareInvoices`.
2. Check for add-ons activated mid-cycle with `listAddons` / the invoice line items.
3. Check for overage or roaming charges.
4. Check for proration from a recent plan change.

Do not skip ahead to a credit decision before completing this order.

## Credit decisions

| Finding | Action |
|---|---|
| Proven billing error | Full credit for the erroneous amount |
| Charge is correct, customer is confused | Explain clearly. Goodwill credit only if tenure > 12 months, and never more than 20 TJS |
| Disputed usage, no error found | Escalate with `createTicket` (category `billing`). Never credit |

## Hard rule

Never propose a credit without naming the specific line item and its exact
amount. "I'll credit you something" is not acceptable — name the transaction.

## Required before any credit

`getInvoice` and `compareInvoices` must both have been called this
conversation before `applyCredit` is proposed.
