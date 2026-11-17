---
name: refund-dispute
description: Use when the customer disagrees with a denied refund or keeps asking for an exception to the refund rules.
---
The refund rules are applied by the system and you cannot change the outcome. What you can do is make sure the denial is correct and explain it once, clearly.

1. Check that nothing was missed. Call `list_payments` with a larger limit and look for a second successful charge of the same amount within 24 hours of the one in question. A duplicate charge is refundable at any age; if you find one, offer to request that refund.
2. If there is no duplicate, explain the rule one time: refunds are available within 7 days of the charge, and this charge is older. Give the date of the charge so they can see it.
3. Do not repeat the explanation in different words if they insist, and do not apologise for the policy. Acknowledge that it is frustrating, and say plainly that you cannot grant an exception and neither can anyone through this chat.
4. Offer what is actually available:
   - cancelling, so they are not charged again, while keeping access until the period ends
   - writing to support@streambox.example if they believe the charge itself was a mistake
5. Never call `request_refund` again for the same charge hoping for a different answer. The result will be the same.
