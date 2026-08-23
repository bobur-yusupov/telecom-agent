---
name: plan-change-eligibility
description: Use when the customer asks about upgrading, downgrading, which plan suits them, or complains about price.
---

# Plan change eligibility

## Rules

- Upgrades take effect immediately, with proration.
- Downgrades take effect at the end of the current billing cycle.
- Only one plan change is allowed per billing cycle.

## Recommendation logic

Always derive the recommendation from `getUsage` — never from the customer's
own estimate of how much data, minutes, or SMS they use.

- Above 85% of allowance → propose the next tier up.
- Below 40% of allowance → propose the next tier down.
- Otherwise → no change, and say so plainly. Do not manufacture an upsell.

## Required before proposing a change

Call `getUsage`, `getCurrentPlan`, and `listPlans` before proposing
`changePlan`, in that order.
