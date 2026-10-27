# Owner decisions

**Status (Oct 26, 2026):** the owner accepted all proposed defaults below. The system is built on these defaults. Any of them can still be changed; most are settings, not code. ★ marks the ones that change the profit numbers.

Still useful when available:
- a real Loyverse export of each type (Q8)
- the current Google Sheets tab and column headers (Q15)
- the actual Maya and Grab fee rates (Q10)

## Money and accounting

1. ★ **Commissary overhead.** Commissary staff, rent share and utilities stay on the Commissary P&L, so branches receive sauce at *ingredient cost only*. Branch profit then looks better than it really is. Pick one:
   - (a) Absorb a **₱/L or ₱/kg labor+overhead rate** into the batch cost.
   - (b) At month-end, **allocate the commissary's net cost to branches in proportion to transfer value**.
   - (c) Leave it as a separate cost center.

   *Default: (b), shown as a separate "after allocation" P&L column. The "direct" view stays available.*
2. ★ **Shared building at Matina.** Do Matina and the Commissary share one **rent contract or electricity/water meter**? If so, we need a fixed split %. *Default: assume separate bills. If shared, 50/50 until you give a split.*
3. **Owner's personal money.** When you pay a business expense from your own pocket, should it be:
   - a **loan from owner** (the business owes you, and it can be repaid), or
   - a **capital contribution**?

   *Default: "Due to owner" (loan), which can be converted to capital at month-end.*
4. **Personal GCash.** Money received in a personal GCash: is it still **business cash** sitting in a personal wallet, or an **owner drawing** the moment it lands? *Default: business cash, flagged "personal". Moving it out is recorded as a drawing.*
5. **Go-live date and opening balances.** Which date do opening balances start from (cash, bank, inventory, unpaid bills)? How many months of Google Sheets history should we import? *Default: go-live on the 1st of the month after Phase 9. Import 12 months of sales and expenses for comparisons.*
6. **Fiscal year.** Calendar year (Jan–Dec)? *Default: yes.*

## Sales, cash and Loyverse

7. **Shifts.** How many shifts per branch per day? Does each shift close its drawer separately, or is there one close at the end of the day? *Default: one close per day, with multi-shift switchable per branch.*
8. ★ **Loyverse setup.**
   - Is it one Loyverse account with 2 stores, or 2 accounts?
   - How is **pax** recorded? For example, one "Unlimited Wings" item sold per head, or one item with a qty?
   - Are **GrabFood** orders rung up in Loyverse too?
   - Please send **one real export of each type** (Receipts and Sales by payment type) for one day, so the importer matches the real columns.
9. **Cash float and deposits.**
   - Is there a fixed opening float per drawer, and how much?
   - Who deposits cash, how often, and do both branches deposit to the same BPI account?

   *Default: ₱2,000 float; deposits recorded by an admin.*
10. **Fees.** Maya MDR % for card and QR, and the settlement delay. Grab commission % and payout cycle. *Default: placeholders you can edit (Maya 2.5% T+1, Grab 30% weekly).*
11. **Service charge.** Is one charged? If yes, is it distributed to staff through payroll? *Default: off.*

## Expenses, inventory and transfers

12. **Approval threshold.** Expenses over **₱5,000** need Owner approval, and anything below needs an Admin. Is that right?
13. ★ **Transfer shortages.** If Lanang receives less than was dispatched, who absorbs the loss? *Default: the sender (commissary) books it as a "transit loss", and it is flagged for review.*
14. **Kids package and pax.** Does a kid count as 1 pax for the wings-per-pax standard, or does it get its own standard? *Default: its own standard per package.*
15. **Google Sheets.** Please share the current sheets, or just their tabs and column headers. I'll align the chart of accounts and the import wizard to them.

## Payroll

16. **Floating staff and pay.**
   - Do staff work at more than one location within a cut-off?
   - Are most of them **minimum-wage earners** (Region XI rate, which makes them tax-exempt)?
   - Are they paid in cash, GCash or bank?
   - What are the rest-day and OT rules?

   *Default: labor is split by the days worked per location. Minimum-wage earner flag on. Paid in cash.*

## Setup and tax

17. **Accounts.** Who will own the Vercel and Supabase accounts? Which email provider should send the scheduled reports? *Default: owner-owned accounts, Supabase Singapore region, Resend for email.*
18. **BIR registration.** One TIN with branch codes, or separate registrations per branch? This only matters for the ₱3M VAT threshold alert. The tax module is deferred for now. *Default: one TIN, branch codes 000/001/002.*
