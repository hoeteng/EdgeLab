# Inventory Chaos Simulator — Redesign Plan (Revised v2)

Updated based on user feedback. Focus is **Demo/Pitch mode (~45s)**.

---

## Proposed Changes

### Inventory Model (Core Rework)

The key insight: **platforms and warehouse are deliberately out of sync**.

**Restocking a platform:** Player clicks `+1/+3/+5` on a platform → adds to that platform's stock counter, but **does NOT subtract from warehouse**. This simulates the real world: you type a number into Shopee's dashboard, but your warehouse still shows its own count.

**Fulfilling an order:** Deducts from **both** the platform stock **and** the warehouse. This is where the pain happens — the warehouse is the source of truth, but the player is managing 3 separate platform counters that drift apart.

**Overselling scenario:** Player restocks Shopee +5, Lazada +5, TikTok +5 (total 15 platform units allocated), but warehouse only has 10. The first 10 fulfilled orders deduct from both correctly. The 11th fulfillment deducts from the platform but the warehouse goes negative → **oversold**.

```
Warehouse: 10         ← actual inventory
Shopee:    5 (typed)  ← what the seller told the platform
Lazada:    5 (typed)
TikTok:    5 (typed)
Total claimed: 15     ← 5 more than reality → inevitable oversell
```

---

### Game Pacing (~60s Demo Mode)

| Phase | Time | Behaviour |
|---|---|---|
| **Setup** | 0–5s | No orders. Hint: "Allocate stock to your platforms!" |
| **Calm** | 5–15s | 1 order every ~5s, single platform, 8–10s timer |
| **Pressure → Chaos** | 15–25s | Ramps from 1→2 orders every 3–4s, 5–7s timer |
| **Chaos + Popup** | 25–35s | 2–3 orders every 1.5–2s, 4–5s timer. Popup fires and **pauses the game** |
| **EdgeLab Tutorial** | 35–45s | Quick 5–10s guided walkthrough after user clicks "Activate EdgeLab" |
| **EdgeLab Free Play** | 45–60s | Player continues with EdgeLab active — automated sync, auto-fulfill, auto-restock. Same order volume as chaos phase but now effortless. Timer runs out → end screen |

**Phase 5 — EdgeLab Tutorial (5–10s):**

The game resumes with a fast, punchy mini-tutorial focusing on two key benefits:

1. **Step 1 — "Inventory Synced"** (~3s): All 3 platform stock counters animate to match the warehouse. Callout: *"Your warehouse and platform inventories are now synced."*
2. **Step 2 — "Demand Forecasting"** (~4s): Forecast bar shows predicted demand per platform. Warehouse is prompted to auto-reorder exactly what's needed. Callout: *"Demand forecasting allows you to anticipate and order exactly how much is needed."*

**Phase 6 — EdgeLab Free Play (~15s):**

Tutorial callouts dismiss. Player keeps playing the game with EdgeLab features active — orders keep coming at chaos-level pace but everything auto-processes smoothly. The contrast with the earlier manual chaos is visceral. Timer runs out → end screen showing the before/after P&L comparison.

---

### EdgeLab — Same UI, 3 Auto-Fulfillment States

EdgeLab uses the **same 3-panel layout**. Orders appear normally but auto-process:

| State | Condition | Visual |
|---|---|---|
| ✅ **Successful Sale** | Platform stock > 0 AND warehouse > 0 | Green badge: "✓ Auto-fulfilled" |
| ⚠️ **Oversold / Refund** | Platform stock > 0 BUT warehouse ≤ 0 | Red badge: "⚠ Oversold — Refund" |
| 💨 **Missed Demand** | Platform stock = 0 (even if warehouse > 0) | Orange badge: "Missed — No platform stock" |

**Demand forecasting:** Shows predicted orders per platform, prompts reorder of suggested quantities to warehouse, then auto-distributes to platforms (instant sync — stock provided automatically to save time).

**UI colour shift:** Entire game UI transitions to green/teal theme via CSS class `edgelab-active`.

---

### Reorder Mechanics (Simplified)

- **No cooldown** — just a 7s delivery timer, button greyed during countdown
- **Customisable amount** — preset buttons for quantity selection
- **Cost:** $5 per unit ordered
- After 7s, stock arrives in warehouse, button re-enables

---

### Allocation Buttons

Per platform panel footer — replace "Push +1 Here" with:

```
[ +1 ] [ +3 ] [ +5 ]   ← adds to platform stock (no warehouse deduction)
```

---

### File Changes

#### [MODIFY] [index.html](file:///Users/hoeteng/Work/EdgeLab/Game/index.html)
- Replace `Push +1` with `+1/+3/+5` allocation buttons
- Remove `#btn-edgelab` from bottom bar and `#edgelab-overlay` div
- Add `#edgelab-modal` popup and `#setup-hint` overlay
- Add tutorial callout element `#tutorial-callout`
- Add reorder quantity selector to bottom bar

#### [MODIFY] [index.css](file:///Users/hoeteng/Work/EdgeLab/Game/index.css)
- Solid platform header colours (orange / blue / black)
- EdgeLab green/teal theme via `.edgelab-active` class
- Modal, tutorial callout, and allocation button styles

#### [MODIFY] [game.js](file:///Users/hoeteng/Work/EdgeLab/Game/game.js)
- Dual-deduction inventory model
- Phase-based order spawner for ~45s demo
- EdgeLab auto-fulfillment with 3 states
- EdgeLab tutorial sequence (3 guided steps)
- Popup trigger system
- Reorder: 7s delivery, no cooldown, $5/unit

---

## Verification Plan

### Browser Testing
1. Demo game → confirm 5s setup, platform stocks at 0, warehouse at 30
2. Allocate stock → platform increases, warehouse unchanged
3. Fulfill → both platform and warehouse decrease
4. Over-allocate + fulfill → warehouse goes negative → oversell alert
5. Popup triggers during chaos phase → game pauses
6. Activate EdgeLab → tutorial plays: sync → auto-fulfill → demand forecast
7. Verify platform header colours and EdgeLab green theme
