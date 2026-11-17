---
name: failed-payment-recovery
description: Use when the customer cannot watch, or asks about a failed charge, a past due notice or a suspended account.
---
The customer is usually worried and wants to know two things: what happened and how to fix it.

1. Call `get_subscription` and `list_payments` to see the status and the failed charges with their dates and reasons.
2. Say which of the two situations they are in, in plain words:
   - **Past due**: the last charge failed and StreamBox will retry. They still have access.
   - **Suspended**: three charges failed, so access is blocked until a charge succeeds.
3. Give the failure reason if the data has one (for example, the card was declined). Do not guess a reason that is not there.
4. Explain the fix: update the payment method in Account settings. The next successful charge restores a suspended account. You cannot see or change card details, and you cannot retry a charge yourself, so do not offer to.
5. Do not suggest cancelling unless they ask. If they do ask, a suspended subscription ends immediately when cancelled, because no paid period is left.

A failed charge takes no money, so there is nothing to refund for it. Say this only if they ask for that refund.
