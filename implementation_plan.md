# Inventory Chaos Simulator — Redesign Plan (Revised v3)

Updated for a clearer judge-facing demo. Focus is now **fast readability + stronger before/after contrast**.

---

## Core Goal

At first glance, judges should understand three things:

1. The seller is manually listing stock across 3 channels.
2. The warehouse is the real number.
3. EdgeLab removes the chaos.

So the UI should use **short labels, one main money number, and fewer words everywhere**.

---

## Inventory Model

Platforms and warehouse stay **deliberately out of sync**.

**List stock:**
Player taps `+1 / +3 / +5` on a platform.
This **only increases platform stock**.
Warehouse does **not** change.

**Fulfill order:**
Order quantity deducts from:
- platform stock
- warehouse stock

**Oversell:**
If warehouse drops below zero while fulfilling, that unit becomes an oversell/refund.

Example:

```text
Warehouse: 10
Shopee:    5
Lazada:    5
TikTok:    5
Claimed:  15
```

The platforms promise 15 units, but the warehouse only has 10.
That gap creates the pain.

---

## Game Pacing (Updated Demo Flow ~70s)

The player should feel the chaos long enough for EdgeLab to be an obvious relief.

| Phase | Time | Behaviour |
|---|---|---|
| Setup | 0-4s | Very short setup. Player lists stock fast. |
| Warm-up | 4-14s | 1-2 orders every ~2.6-3.4s, qty 1-2. |
| Stress | 14-28s | 1-2 orders every ~1.5-2.2s, qty 1-3. |
| Chaos | 28-45s | 2-3 orders every ~0.8-1.2s, qty 2-5. |
| Popup | 45s | Game pauses. EdgeLab offer appears after the player has already felt the pain. |
| EdgeLab Tutorial | 45-52s | Quick 2-step walkthrough: sync, then forecast + auto-restock. |
| EdgeLab Free Play | 52-70s | Same chaos-level demand, but now handled cleanly and automatically. |

### Why this pacing works

- The player gets enough time to understand the controls.
- The chaos arrives hard enough to create visible failure.
- EdgeLab activates late enough that the contrast feels earned.

---

## Order Behaviour

Orders should feel closer to real e-commerce demand.

### Randomized quantity

Order size should vary by phase:

- Warm-up: `1-2`
- Stress: `1-3`
- Chaos: `2-5`

This creates bigger swings in profit, missed demand, and oversells.

### Result

A single bad decision can now cause:
- a big sale
- a big miss
- a painful oversell

This makes the demo more dramatic and more realistic.

---

## Economy / Balance

The game should feel tighter and more visible financially.

### Start state

- Starting balance: `$0`
- Warehouse starts with stock, but cash starts at zero

### Reorder

- Cost per unit should increase significantly
- Delivery time should be longer
- Reorder should feel expensive and risky in manual mode

Recommended demo tuning:

- Reorder cost: `$12` per unit
- Delivery time: `12s`

### Effect

This makes EdgeLab's forecast + auto-restock feel more valuable.

---

## UI Copy Direction

All copy should be shorter.

### Principles

- Prefer `1-3` words where possible
- Remove duplicate explanations
- Let color + motion carry meaning
- Keep alerts concise and non-blocking

### Examples

Use:
- `Net`
- `Warehouse`
- `Net`
- `Turn On EdgeLab`
- `+$36 Sale`
- `-$48 Lost`
- `-$64 Refund`
- `+10 Stock`

Avoid long sentences in active play.

---

## Alerts

Alerts should:

- stay out of the centre of the screen
- not cover the main play area
- disappear quickly
- use short money-first wording

Examples:

- `+$54 Sale`
- `-$36 Lost`
- `-$96 Refund`
- `+15 Stock`
- `EdgeLab On`

---

## EdgeLab Mode

EdgeLab should keep the **same 3-panel layout** so the contrast is obvious.

### Auto outcomes

| State | Condition | Badge |
|---|---|---|
| Success | platform > 0 and warehouse > 0 | `Auto-Fill` |
| Oversold | platform > 0 and warehouse <= 0 | `Refund` |
| Missed | platform = 0 | `Missed` |

### Tutorial

Two short steps only:

1. `Sync On` — all platforms match warehouse
2. `Forecast On` — stock is auto-bought and auto-listed

---

## File Changes

### [MODIFY] `index.html`
- simplify wording across the game UI
- use one main net counter instead of separate net/lost counters
- replace list buttons with `- value +` controls for platform stock and reorder quantity
- make warehouse the central number

### [MODIFY] `index.css`
- move alerts away from the main play area
- reduce alert size and visual noise
- keep EdgeLab contrast strong without adding clutter

### [MODIFY] `game.js`
- retune pacing for a longer pre-EdgeLab chaos arc
- randomize order quantities by phase
- raise reorder cost and delivery time
- start balance at zero
- make sale / loss / refund values more visible
- shorten runtime alerts and labels

---

## Verification

1. Start demo and confirm the UI reads clearly at a glance.
2. Confirm setup time gives enough room to list stock.
3. Confirm chaos becomes genuinely hard before the popup appears.
4. Confirm order quantities vary visibly.
5. Confirm reorder is expensive and slow enough to hurt.
6. Confirm alerts stay small and off the main play area.
7. Confirm EdgeLab free play feels dramatically easier than manual mode.
