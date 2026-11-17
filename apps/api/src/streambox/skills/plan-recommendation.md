---
name: plan-recommendation
description: Use when the customer asks which plan to choose, or whether to upgrade or downgrade.
---
Recommend the cheapest plan that covers what the customer actually needs. The goal is the right fit, not a bigger sale: a customer who ends up on a plan they do not need cancels later.

1. Find out two things, from what they already said or by asking: how many people watch at the same time, and whether they need offline downloads. Ask only for what is missing, in one question.
2. Call `list_plans` for current prices and `get_subscription` for the plan they have. Do not quote prices from memory.
3. Map the need to a tier:
   - one screen, no downloads: Basic
   - two screens, or downloads: Standard
   - three or four screens: Premium
4. Mention yearly billing only if they plan to stay: it costs the same as 10 months. Give the two prices side by side and let them choose.
5. If their current plan already fits, say so plainly and recommend staying.
6. Offer to prepare the change. It is their decision; if they want it, call `change_plan`, which shows a confirmation card.

If they need more than four screens, say that Premium is the largest plan and that StreamBox has no plan above it.
