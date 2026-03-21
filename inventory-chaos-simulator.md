# Inventory Chaos Simulator

**An interactive demo game for the EdgeLab pitch — designed to make judges *feel* the pain of multi-channel inventory management in under 45 seconds.**

**Platform:** Responsive web app (laptop and mobile via browser). No install required.

---

## Problem Context

E-commerce sellers operating across Shopee, Lazada, TikTok Shop, Shopify, and other platforms face a brutal operational reality:

- **No single source of truth.** Stock levels live in separate dashboards with no synchronization.
- **Manual updates are slow and error-prone.** One missed update cascades into overselling, refunds, and penalties.
- **The more channels you add, the worse it gets.** Growth becomes a liability instead of an advantage.
- **Restocking is reactive, not proactive.** Sellers reorder too late, run out of stock, and lose sales across every channel.

The result: lost revenue, angry customers, platform penalties, and operator burnout.

---

## Objective of the Game

Put the player in the seat of a multi-channel seller and force them to manage incoming orders across platforms — manually, in real time, with no sync.

**Goal:** Fulfill as many orders as possible while staying profitable.

**The game does not end on your first mistake.** Overselling, stockouts, and complaints impose financial penalties — but you keep playing. The game ends when either the timer runs out or your balance drops below **-$150** and the business becomes **insolvent**.

A live **Missed Sales** counter tracks every order that arrived at a platform when it was out of stock — showing the real cost of uncaptured demand.

**Reality:** It is intentionally impossible to keep up. That is the point.

---

## Screen Layout

The game runs on a **single screen** with three side-by-side platform panels (Shopee, Lazada, TikTok Shop). This is a deliberate design choice:

- **Judges see everything at once.** No tab switching, no hidden state.
- **The chaos is visible.** Three panels filling with orders simultaneously is an immediate visual punch.
- **It mirrors reality.** Sellers literally have multiple browser windows open, fighting to keep up.

On **mobile**, the three panels stack vertically with a sticky summary bar at the top showing total stock remaining and accumulated losses. The player scrolls between panels — which makes the chaos feel even worse, since you cannot see all platforms at the same time.

### Layout Structure

```
+-------------------------------------------------------------+
|  BAL: $80  |  MISSED SALES: $40  |  TIME: 0:18              |
+-------------------------------------------------------------+
+------------------+------------------+------------------+
|     SHOPEE       |     LAZADA       |   TIKTOK SHOP    |
|  [Stock: 8]      |  [Stock: 11]     |  [Stock: 7]      |
|                  |                  |                   |
|  Order #12       |  Order #09       |  Order #15        |
|  Qty: 2 [FILL]   |  Qty: 3 [FILL]   |  Qty: 1 [FILL]   |
|  ---- 3s ----    |  ---- 2s ----    |  ---- 4s ----     |
|                  |                  |                   |
|  [PUSH +5 HERE]  |  [PUSH +3 HERE]  |  [PUSH +2 HERE]  |
+------------------+------------------+------------------+
|  WAREHOUSE: 12  |  [REORDER - $30]  |  Cooldown: Ready |
+-------------------------------------------------------------+
```

- **Top bar:** Balance, missed sales total, and countdown timer — always visible, the first thing judges see.
- **Bottom bar:** Warehouse stock, reorder button with cost, and cooldown status.
- The **MISSED SALES** counter tracks cumulative dollar value of orders that arrived at platforms with zero stock. This is not a penalty — it is a visibility metric showing real demand the player could not capture.

---

## Core Gameplay Mechanics

### Setup

- The player manages **one product** with a starting stock of **20 units**.
- Orders arrive simultaneously across **3 platform panels** on a single screen: Shopee, Lazada, and TikTok Shop.
- Each panel displays its own order queue and a local stock counter.
- There is **no shared inventory view** — the player must mentally track total stock.
- The game is designed to be **immediately understandable** — tap/click to fulfill, watch the numbers, survive.

### Player Actions

| Action | Description |
|---|---|
| **Fulfill** | Accept the order and manually deduct stock from that platform's counter. |
| **Skip** | Ignore the order (it expires and triggers a penalty). |
| **Update Stock** | Manually type a stock number into another platform's panel to "sync" it. |
| **Reorder Stock** | Request more inventory to your **central warehouse** (costs money, takes time). |
| **Push Stock** | Manually distribute units from the warehouse to a specific platform. |

### Reorder and Distribution Mechanic

Beyond the starting 20 units, the player can reorder stock — but it goes to a **central warehouse**, not directly to platforms.

**Step 1 — Reorder to Warehouse:**
- A **"Reorder Stock"** button sits in the bottom summary bar.
- Reordering costs **$30** (deducted from balance immediately).
- A progress indicator shows: **"Shipment arriving in 8s..."**
- Stock is added to the **warehouse counter** once the timer completes.
- **Cooldown:** After reordering, the button is disabled for **15 seconds** before you can reorder again.
- **Warehouse capacity:** Maximum **15 units** in the warehouse at any time.

**Step 2 — Push to Platforms (Manual):**
- Warehouse stock does not automatically appear on any platform.
- The player must click **"Push +N"** on each platform panel to allocate units from the warehouse.
- The player decides how many units to send to each platform.
- This takes time — and while you are distributing, orders keep arriving.

This two-step process mirrors reality: suppliers ship to your warehouse, then **you** must allocate and update each channel manually. It is slow, error-prone, and falls apart at scale.

**Why the cooldown and cap exist:** Without constraints, a savvy player could stockpile inventory early and coast through the chaos. The cooldown forces the player to time their reorders strategically, and the warehouse cap prevents hoarding. Combined with the $30 cost, restocking becomes a genuine resource management decision — not an easy escape.

### How Overselling Happens

Overselling is not random — it is the direct consequence of the player being overwhelmed:

1. **The scramble:** Orders accelerate. The player is busy fulfilling on one platform.
2. **The neglect:** They forget to reorder stock in time, or the reorder is still in transit.
3. **The miscount:** They push stock to platforms based on outdated mental math — allocating units they do not actually have.
4. **The crash:** A platform auto-fulfills an order against stock that was already sold elsewhere. The player updated the number on screen, but the real inventory was already gone.

The chaos creates the oversell. The player's own scrambling is the cause.

### Missed Sales Counter

When an order arrives at a platform and that platform's stock is **zero**, the order is automatically lost. It cannot be fulfilled or skipped — it simply vanishes with a flash:

- **"Missed sale: $10"** — the order disappears and the missed sales counter increments.
- The counter sits in the summary bar, growing throughout the game.
- It does not reduce the player's balance — it shows **uncaptured demand**.
- At the end screen, it is displayed separately: **"You missed $[X] in sales from stockouts."**

This mechanic makes the cost of poor restocking viscerally clear. The player sees real money they could have earned slipping away because they did not have stock on the shelf.

### Order Flow

- Orders appear as notification-style cards inside each platform panel.
- Each order has a **short timer** (3–5 seconds) before it auto-fulfills or expires.
- Order volume **accelerates within the round** — the rate of incoming orders increases as the clock ticks down. The first 10 seconds feel manageable. The last 10 seconds feel impossible. This mirrors how 11.11 flash sales ramp up in real life.

### Game End Conditions

The game does not end on the first mistake. Penalties accumulate, and the player keeps playing until one of two conditions is met:

| Condition | Trigger | Screen Message |
|---|---|---|
| **Timer expires** | 30s (demo) or 60s (interactive) elapsed | "Time's up. Here's your P&L." |
| **Insolvency** | Balance drops below **-$150** | **"BUSINESS INSOLVENT. Game over."** |

This design ensures:
- Overselling and stockouts are **painful but survivable** — just like in real life, until they are not.
- The insolvency threshold creates genuine tension. Every penalty chips away at the balance.
- Judges who play well still feel the stress. Judges who play poorly see the business collapse in real time.

---

## Pain Mechanics

Every mechanic maps directly to a real business pain point. This is not arbitrary difficulty — it is operational truth.

| Game Mechanic | Real-World Pain Point |
|---|---|
| No shared inventory view | Sellers juggle 3–5 separate dashboards daily |
| Manual stock deduction per platform | Every sale requires manual updates across all channels |
| Orders arriving faster than you can update | Peak hours and flash sales create impossible workloads |
| Auto-fulfilled orders exceeding stock | Overselling happens because sync is never instant |
| Penalty for skipped orders | Platforms penalize slow response and cancellations |
| Conflicting stock numbers across panels | No single source of truth leads to data drift |
| Reorder goes to warehouse, not platforms | Suppliers ship to you — you still have to distribute manually |
| Manual push from warehouse to each platform | Allocation decisions under pressure lead to mistakes |
| Reorder delay (stock not instant) | Supply chain lead times cause stockouts during peak demand |
| Reactive restocking | Without forecasting, sellers always reorder too late |
| Missed sales counter (orders lost at zero stock) | Real uncaptured demand that the seller never even sees |

### Triggered Events (UI Alerts)

As the player falls behind, the game surfaces real consequences:

- **"Oversold! Refund required."** — Stock went negative on a platform.
- **"Customer complaint filed."** — An oversold order triggered a support ticket.
- **"Penalty fee: -$15.00"** — Platform imposed a late fulfillment penalty.
- **"Out of stock! 3 orders lost."** — Stockout caused missed sales while waiting for reorder.
- **"Missed sale: $10"** — An order arrived but the platform had zero stock.
- **"Seller rating dropped to 3.2"** — Accumulated issues degraded store health.
- **"Account warning: Risk of suspension."** — Too many infractions flagged the account.

These alerts stack visually, creating a sense of mounting pressure. The missed sales counter in the summary bar grows quietly alongside the chaos — a constant reminder of demand the player is leaving on the table.

---

## Demo Flow (30–45 Seconds)

A scripted sequence for the live pitch. The presenter plays the game on screen while narrating.

### Phase 1 — Calm Start (0:00–0:10)

- 2–3 orders arrive across platforms at a comfortable pace.
- Presenter fulfills them manually, narrating:

> "This is what managing inventory looks like on day one. A few orders, a few platforms. Manageable."

### Phase 2 — Acceleration (0:10–0:25)

- Order frequency doubles. Orders appear on all three platforms simultaneously.
- Presenter starts falling behind. Stock numbers diverge.
- Stock runs low. Presenter hits **Reorder** — sees **"Shipment arriving in 8s..."**
- Stock arrives in warehouse — presenter scrambles to push units to each platform.
- First alert fires: **"Oversold! Refund required."** Balance drops.
- Narration:

> "Now imagine 11.11 sales. Orders are pouring in. You reorder stock — but it goes to your warehouse. You still have to push it to each platform manually. While you are doing that, Lazada already sold a unit you do not have. You are now oversold, and your balance is dropping. And look — missed sales are piling up on TikTok Shop because you ran out of stock there."

### Phase 3 — Collapse (0:25–0:40)

- Orders flood all panels. Alerts stack: complaints, penalties, rating drops, stockouts.
- Presenter stops trying.
- Screen freezes on a chaotic dashboard full of red alerts.
- Narration:

> "This is the reality for thousands of sellers today. This is not a game — this is Tuesday."

### Phase 4 — Solution Transition (0:40–0:45)

- Screen fades to a clean, unified dashboard: **EdgeLab**.
- Single inventory view. Auto-sync across all platforms. Demand forecasting. Smart restocking.
- Narration:

> "Now imagine one dashboard. One stock count. Auto-synced everywhere. And it already knows what to reorder before you run out. That is EdgeLab."

---

## Solution Transition — EdgeLab

The game exists to create contrast. After the chaos, EdgeLab appears as the obvious answer.

### Key Messaging

| Chaos (Before) | EdgeLab (After) |
|---|---|
| 3 separate panels, no shared view | 1 unified inventory view |
| Manual stock updates | Real-time auto-sync |
| Overselling and refunds | Stock locks prevent overselling |
| Customer complaints | Accurate fulfillment, every time |
| Penalty fees and rating drops | Platform health maintained automatically |
| Missed sales from stockouts | **Demand forecasting — restock before you run out** |
| Guessing what to reorder and when | **Predictive analytics drive purchase orders automatically** |

### Demand Forecasting — The Distinctive Edge

EdgeLab does not just sync inventory. It **predicts future demand** and triggers restocking before stockouts happen.

- Analyzes order velocity, seasonal trends, and platform-specific patterns.
- Generates **automated restock recommendations** with lead time factored in.
- Prevents the scenario where a seller reorders too late and loses sales for days.
- Eliminates missed sales entirely — stock is always on the shelf when demand arrives.

This is the feature that separates EdgeLab from basic sync tools. Sync solves today's problem. **Forecasting solves tomorrow's.**

### Transition UI Text

> "What if your inventory knew what was coming — and restocked itself before you even noticed?"

---

## "Activate EdgeLab" — Mid-Game Toggle

During the post-pitch interactive version, the player can **activate EdgeLab mid-game** to feel the instant contrast.

### How It Works

- A prominent button appears at the bottom of the screen: **"Activate EdgeLab"**
- When pressed, the three chaotic panels **merge into a single unified view**.
- All pending orders are auto-fulfilled. Stock syncs instantly across platforms.
- A **demand forecast bar** appears, showing predicted orders for the next 30 seconds and an auto-reorder indicator.
- The **missed sales counter stops** — because stock is now always available where demand exists.
- The chaos stops. The alerts stop. The player watches orders flow smoothly.

### Why This Works

- It is not framed as a "power-up" — it is framed as **upgrading your operations**.
- The before/after happens in the same session, making the contrast undeniable.
- Judges experience the relief firsthand. That emotional shift is the pitch.
- The missed sales counter freezing at its final number is a powerful visual — it shows exactly how much demand was lost before EdgeLab was activated.

### UI Text on Activation

> "EdgeLab activated. Inventory synced. Demand forecast enabled. Auto-restock scheduled. Missed sales: $0 going forward."

---

## Post-Pitch Interactive Version

After the live demo, judges can play the full version on a laptop or phone (responsive web app, works in any browser). This version extends the 30-second demo into a deeper, self-guided experience.

### Features

- **Difficulty Scaling:** Easy (2 platforms, slow orders) to Hard (5 platforms, flash sale speed).
- **Reorder Mechanic:** Players must manage restocking with realistic supply delays.
- **Profit/Loss Breakdown:** Final screen shows total revenue earned, refunds issued, penalties paid, and net profit/loss — all in dollars.
- **Missed Sales Tracker:** Visible counter showing total uncaptured demand from stockouts.
- **"Activate EdgeLab" Toggle:** Mid-game, the player can enable auto-sync and demand forecasting to feel the instant relief of the solution.
- **Side-by-Side Mode:** Split screen — left side is manual chaos, right side is EdgeLab handling the same order volume with demand forecasting.

### Responsive Design

| Device | Layout |
|---|---|
| **Laptop/Desktop** | Three side-by-side panels, full summary bar at bottom |
| **Tablet** | Three panels with condensed spacing, touch-optimized buttons |
| **Mobile** | Stacked panels with sticky top bar (total stock + losses), swipe between platforms |

The game must feel native on every device. Large tap targets, clear typography, and high-contrast status indicators are critical.

### Scoring System — Dollar-Based

The scoring system uses **dollars, not points**. Judges are evaluating a business — the impact must feel financial, not gamified.

The player starts with a **balance of $200** (working capital). Every action has a financial consequence.

| Event | Financial Impact |
|---|---|
| Order fulfilled correctly | +$10 revenue |
| Oversold order (refund) | -$25 loss |
| Customer complaint triggered | -$15 cost |
| Penalty fee incurred | -$20 fee |
| Skipped/expired order | -$5 missed revenue |
| Stockout (order lost while awaiting restock) | -$10 lost sale |
| Reorder stock (to warehouse) | -$30 cost of goods |
| Missed sale (order at zero-stock platform) | $0 penalty, but tracked in Missed Sales counter |

**Game over at -$150.** If the balance hits this threshold, the screen displays **"BUSINESS INSOLVENT"** and the game ends immediately.

**Final result categories (if timer expires):**

- **Below $0:** "Your store is bleeding money." — You need EdgeLab.
- **$0–$100:** "Surviving, but barely." — EdgeLab stops the bleeding.
- **$100+:** "Impressive — but unsustainable at scale." — EdgeLab makes it effortless.

### End Screen

> "You lost $[X] in refunds and penalties. You missed $[Y] in sales from stockouts. EdgeLab would have saved every one of those orders — and predicted your restock before you ran out. Zero overselling. Zero missed sales. One dashboard."

---

## UI Design Guidance

The UI is a critical success factor. Judges form opinions in seconds. The interface must communicate professionalism, clarity, and urgency.

### Design Principles

- **Clarity over decoration.** Every element must be immediately understandable — no learning curve.
- **Visual urgency.** Red alerts, countdown timers, and flashing borders create authentic stress.
- **Clean contrast.** The EdgeLab transition must feel like a breath of fresh air — muted colors, organized layout, calm typography.
- **Touch-first.** Buttons must be large enough for confident tapping on mobile.

### Recommended Visual Language

| Element | Style |
|---|---|
| Platform panels | Card-based, distinct brand colors per platform (Shopee orange, Lazada blue, TikTok black) |
| Order cards | White cards with countdown timer bar, large "Fulfill" button |
| Alerts | Red toast notifications, stacking from the top |
| Reorder indicator | Yellow progress bar with countdown text |
| EdgeLab view | Clean white/dark background, green success indicators, forecast chart |
| Typography | Sans-serif (Inter or similar), large and legible |

### UI Tooling

If working with a designer or UI framework (e.g., Stitch, Figma, or a component library), prioritize:

1. **Component consistency** — buttons, cards, and alerts should feel like one product.
2. **Platform branding** — subtle use of Shopee/Lazada/TikTok brand colors for instant recognition.
3. **Animation polish** — smooth transitions for alert stacking, panel merging (EdgeLab activation), and order card entry/exit.
4. **Responsive testing** — verify the layout works on common laptop resolutions (1366x768, 1920x1080) and mobile (375x812, 390x844).

---

## Key Takeaway

The Inventory Chaos Simulator is not entertainment. It is a **30-second proof of pain**.

It compresses hours of daily seller frustration into a moment judges can feel firsthand — then immediately positions EdgeLab as the only rational response.

The missed sales counter makes invisible losses visible. The reorder mechanic shows why sync alone is not enough. **Demand forecasting is the unlock** — and EdgeLab is the only platform that has it.

**The chaos is the pitch. The calm is the product. The forecast is the edge.**
