// ============================================================
// INVENTORY CHAOS SIMULATOR — Game Engine
// ============================================================

(() => {
  'use strict';

  // ========== CONFIGURATION ==========
  const CONFIG = {
    easy:   { duration: 60, baseInterval: 3500, minInterval: 1800, acceleration: 0.92, startStock: 24 },
    normal: { duration: 60, baseInterval: 2600, minInterval: 1000, acceleration: 0.88, startStock: 20 },
    demo:   { duration: 30, baseInterval: 2200, minInterval:  800, acceleration: 0.84, startStock: 20 },
  };

  const PRICES = {
    fulfilled:  10,
    oversold:  -25,
    complaint: -15,
    penalty:   -20,
    skipped:    -5,
    stockout:  -10,
    reorder:   -30,
    missedSale: 10,  // value tracked in missed-sales counter
  };

  const REORDER_DELIVERY_TIME = 8000; // ms
  const REORDER_COOLDOWN      = 15000;
  const REORDER_QTY            = 10;
  const WAREHOUSE_CAP          = 15;
  const ORDER_TIMER_RANGE      = [3000, 5000]; // ms
  const INSOLVENCY_THRESHOLD   = -150;
  const PLATFORMS              = ['shopee', 'lazada', 'tiktok'];

  // Alert messages pool
  const ALERT_MESSAGES = {
    oversell:   ['⚠️ Oversold! Refund required.', 'alert-red'],
    complaint:  ['😡 Customer complaint filed.', 'alert-red'],
    penalty:    ['💸 Penalty fee: -$15.00', 'alert-red'],
    stockout:   ['📦 Out of stock! Orders lost.', 'alert-orange'],
    missedSale: ['💨 Missed sale: -$__', 'alert-orange'],
    ratingDrop: ['⭐ Seller rating dropped!', 'alert-yellow'],
    warning:    ['🚨 Account warning: Risk of suspension.', 'alert-red'],
  };

  // ========== STATE ==========
  let state = {
    difficulty: 'normal',
    running: false,
    balance: 200,
    missedSales: 0,
    revenue: 0,
    penalties: 0,
    restockCost: 0,
    timeLeft: 60,
    totalTime: 60,
    warehouse: 0,
    orderCounter: 0,
    edgelabActive: false,
    platformStock: { shopee: 7, lazada: 7, tiktok: 6 },
    orders: { shopee: [], lazada: [], tiktok: [] },
    reorderState: 'ready', // 'ready' | 'shipping' | 'cooldown'
    reorderTimer: null,
    cooldownTimer: null,
    oversellCount: 0,
    penaltyCount: 0,
    gameInterval: null,
    orderInterval: null,
    timerInterval: null,
    edgelabInterval: null,
    orderTickIntervals: [],
  };

  // ========== DOM REFS ==========
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const DOM = {
    startScreen: $('#start-screen'),
    gameScreen:  $('#game-screen'),
    endScreen:   $('#end-screen'),
    btnStart:    $('#btn-start'),
    btnRestart:  $('#btn-restart'),
    balance:     $('#balance'),
    missedSales: $('#missed-sales'),
    timer:       $('#timer'),
    warehouse:   $('#warehouse-stock'),
    btnReorder:  $('#btn-reorder'),
    reorderStatus: $('#reorder-status'),
    alertContainer: $('#alert-container'),
    btnEdgelab:  $('#btn-edgelab'),
    edgelabOverlay: $('#edgelab-overlay'),
    edgelabOrders: $('#edgelab-orders'),
    edgelabTotalStock: $('#edgelab-total-stock'),
  };

  // ========== HELPERS ==========
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#${id}`).classList.add('active');
  }

  // ========== ALERTS ==========
  function showAlert(text, cls = 'alert-red') {
    const el = document.createElement('div');
    el.className = `alert-toast ${cls}`;
    el.textContent = text;
    DOM.alertContainer.prepend(el);
    // remove after animation
    setTimeout(() => el.remove(), 2800);
    // limit stacked alerts
    while (DOM.alertContainer.children.length > 5) {
      DOM.alertContainer.lastChild.remove();
    }
  }

  // ========== UI UPDATE ==========
  function updateUI() {
    // Balance
    DOM.balance.textContent = `$${state.balance}`;
    DOM.balance.classList.toggle('negative', state.balance < 0);

    // Missed sales
    DOM.missedSales.textContent = `$${state.missedSales}`;

    // Timer
    DOM.timer.textContent = formatTime(state.timeLeft);
    DOM.timer.classList.toggle('urgent', state.timeLeft <= 10);

    // Warehouse
    DOM.warehouse.textContent = state.warehouse;

    // Platform stocks
    PLATFORMS.forEach(p => {
      const el = $(`.stock-count[data-platform="${p}"]`);
      const s = state.platformStock[p];
      el.textContent = s;
      el.classList.toggle('low', s > 0 && s <= 3);
      el.classList.toggle('out', s <= 0);
    });

    // Push buttons
    $$('.btn-push').forEach(btn => {
      btn.disabled = state.warehouse <= 0;
    });

    // Reorder button
    DOM.btnReorder.disabled = state.reorderState !== 'ready';

    // Reorder status
    DOM.reorderStatus.className = 'reorder-status';
    if (state.reorderState === 'ready') {
      DOM.reorderStatus.textContent = 'Ready';
      DOM.reorderStatus.classList.add('ready');
      DOM.btnReorder.classList.remove('shipping');
    } else if (state.reorderState === 'shipping') {
      DOM.reorderStatus.classList.add('active');
      DOM.btnReorder.classList.add('shipping');
    } else if (state.reorderState === 'cooldown') {
      DOM.reorderStatus.classList.add('cooldown');
      DOM.btnReorder.classList.remove('shipping');
    }

    // EdgeLab total stock
    if (state.edgelabActive) {
      const total = PLATFORMS.reduce((sum, p) => sum + state.platformStock[p], 0) + state.warehouse;
      DOM.edgelabTotalStock.textContent = total;
    }
  }

  // ========== BALANCE CHANGES ==========
  function changeBalance(amount, reason) {
    state.balance += amount;
    if (amount > 0) {
      state.revenue += amount;
    } else {
      if (reason === 'restock') {
        state.restockCost += Math.abs(amount);
      } else {
        state.penalties += Math.abs(amount);
      }
    }
    // Flash effect
    DOM.balance.classList.remove('balance-flash-red', 'balance-flash-green');
    void DOM.balance.offsetWidth; // trigger reflow
    DOM.balance.classList.add(amount >= 0 ? 'balance-flash-green' : 'balance-flash-red');
    updateUI();

    // Check insolvency
    if (state.balance <= INSOLVENCY_THRESHOLD) {
      endGame('insolvent');
    }
  }

  // ========== MISSED SALES ==========
  function addMissedSale(qty) {
    const val = qty * PRICES.missedSale;
    state.missedSales += val;
    showAlert(`💨 Missed sale: $${val}`, 'alert-orange');
    DOM.missedSales.classList.add('shake');
    setTimeout(() => DOM.missedSales.classList.remove('shake'), 500);
    updateUI();
  }

  // ========== ORDER MANAGEMENT ==========
  let nextOrderId = 1;

  function createOrder(platform) {
    if (!state.running) return;
    if (state.edgelabActive) return; // EdgeLab handles orders

    const qty = rand(1, 3);
    const stock = state.platformStock[platform];

    // If platform is out of stock, it's a missed sale
    if (stock <= 0) {
      addMissedSale(qty);
      flashPanel(platform);
      return;
    }

    const id = nextOrderId++;
    const timerDuration = rand(ORDER_TIMER_RANGE[0], ORDER_TIMER_RANGE[1]);
    const order = {
      id,
      platform,
      qty,
      timerDuration,
      timeRemaining: timerDuration,
      element: null,
      tickInterval: null,
    };

    // Create DOM element
    const card = document.createElement('div');
    card.className = 'order-card';
    card.id = `order-${id}`;
    card.innerHTML = `
      <div class="order-top-row">
        <span class="order-id">Order #${String(id).padStart(2, '0')}</span>
        <span class="order-qty">Qty: ${qty}</span>
      </div>
      <div class="order-timer-bar">
        <div class="order-timer-fill" style="width:100%"></div>
      </div>
      <button class="btn-fulfill" id="btn-fulfill-${id}">✓ Fulfill</button>
    `;

    const queue = $(`#orders-${platform}`);
    queue.prepend(card);
    order.element = card;

    // Fulfill button
    card.querySelector('.btn-fulfill').addEventListener('click', () => fulfillOrder(order));

    // Timer tick
    const tickRate = 50; // ms
    order.tickInterval = setInterval(() => {
      if (!state.running) return;
      order.timeRemaining -= tickRate;
      const pct = Math.max(0, (order.timeRemaining / order.timerDuration) * 100);
      const fill = card.querySelector('.order-timer-fill');
      if (fill) {
        fill.style.width = `${pct}%`;
        fill.classList.toggle('warning', pct < 50 && pct > 20);
        fill.classList.toggle('critical', pct <= 20);
      }
      if (order.timeRemaining <= 0) {
        clearInterval(order.tickInterval);
        expireOrder(order);
      }
    }, tickRate);

    state.orderTickIntervals.push(order.tickInterval);
    state.orders[platform].push(order);
  }

  function fulfillOrder(order) {
    if (!state.running) return;
    clearInterval(order.tickInterval);

    const stock = state.platformStock[order.platform];

    if (stock >= order.qty) {
      // Successful fulfillment
      state.platformStock[order.platform] -= order.qty;
      changeBalance(order.qty * PRICES.fulfilled, 'revenue');
      order.element.classList.add('fulfilled');
    } else if (stock > 0) {
      // Partial — fulfill what we have, oversell the rest
      state.platformStock[order.platform] = 0;
      const oversoldQty = order.qty - stock;
      changeBalance(stock * PRICES.fulfilled, 'revenue');
      triggerOversell(order.platform, oversoldQty);
      order.element.classList.add('fulfilled');
    } else {
      // Complete oversell
      triggerOversell(order.platform, order.qty);
      order.element.classList.add('fulfilled');
    }

    removeOrderFromState(order);
    setTimeout(() => order.element?.remove(), 500);
    updateUI();
  }

  function expireOrder(order) {
    if (!state.running) return;

    // Check if it auto-fulfills (overselling scenario) or just skipped
    const stock = state.platformStock[order.platform];
    if (stock > 0) {
      // Auto-fulfill (simulates platform accepting the order)
      const fulfillQty = Math.min(stock, order.qty);
      state.platformStock[order.platform] -= fulfillQty;
      changeBalance(fulfillQty * PRICES.fulfilled, 'revenue');

      if (fulfillQty < order.qty) {
        triggerOversell(order.platform, order.qty - fulfillQty);
      }
      order.element.classList.add('expired');
    } else {
      // Skipped/expired — penalty
      changeBalance(PRICES.skipped, 'skip');
      showAlert(`⏳ Order #${String(order.id).padStart(2, '0')} expired — $5 penalty`, 'alert-yellow');
      order.element.classList.add('expired');
    }

    removeOrderFromState(order);
    setTimeout(() => order.element?.remove(), 500);
    updateUI();
  }

  function removeOrderFromState(order) {
    const idx = state.orders[order.platform].indexOf(order);
    if (idx > -1) state.orders[order.platform].splice(idx, 1);
  }

  function triggerOversell(platform, qty) {
    state.oversellCount++;
    changeBalance(qty * PRICES.oversold, 'oversell');
    showAlert(ALERT_MESSAGES.oversell[0], ALERT_MESSAGES.oversell[1]);
    flashPanel(platform);

    // Chance of additional cascading events
    if (state.oversellCount >= 2 && Math.random() < 0.5) {
      setTimeout(() => {
        changeBalance(PRICES.complaint, 'complaint');
        showAlert(ALERT_MESSAGES.complaint[0], ALERT_MESSAGES.complaint[1]);
      }, 600);
    }
    if (state.oversellCount >= 3 && Math.random() < 0.4) {
      setTimeout(() => {
        changeBalance(PRICES.penalty, 'penalty');
        showAlert(ALERT_MESSAGES.penalty[0], ALERT_MESSAGES.penalty[1]);
      }, 1200);
    }
    if (state.oversellCount >= 5) {
      setTimeout(() => {
        showAlert(ALERT_MESSAGES.ratingDrop[0], ALERT_MESSAGES.ratingDrop[1]);
      }, 800);
    }
    if (state.oversellCount >= 7) {
      setTimeout(() => {
        showAlert(ALERT_MESSAGES.warning[0], ALERT_MESSAGES.warning[1]);
      }, 1400);
    }
  }

  function flashPanel(platform) {
    const panel = $(`#panel-${platform}`);
    panel.classList.add('flash-red');
    setTimeout(() => panel.classList.remove('flash-red'), 600);
  }

  // ========== ORDER SPAWNING ==========
  function startOrderSpawning() {
    const cfg = CONFIG[state.difficulty];
    let currentInterval = cfg.baseInterval;

    function spawnWave() {
      if (!state.running) return;

      // Pick 1-2 random platforms
      const count = state.timeLeft < state.totalTime * 0.4 ? rand(2, 3) : rand(1, 2);
      const shuffled = [...PLATFORMS].sort(() => Math.random() - 0.5);
      for (let i = 0; i < count; i++) {
        createOrder(shuffled[i % shuffled.length]);
      }

      // Accelerate
      currentInterval = Math.max(cfg.minInterval, currentInterval * cfg.acceleration);
      state.orderInterval = setTimeout(spawnWave, currentInterval);
    }

    // First order after 1.5s
    state.orderInterval = setTimeout(spawnWave, 1500);
  }

  // ========== REORDER / WAREHOUSE ==========
  function reorderStock() {
    if (state.reorderState !== 'ready' || !state.running) return;
    if (state.balance + PRICES.reorder <= INSOLVENCY_THRESHOLD) return; // don't allow reorder into insolvency

    changeBalance(PRICES.reorder, 'restock');
    state.reorderState = 'shipping';
    DOM.reorderStatus.textContent = 'Arriving in 8s...';
    updateUI();

    let countdown = REORDER_DELIVERY_TIME / 1000;
    const cdInterval = setInterval(() => {
      countdown--;
      DOM.reorderStatus.textContent = `Arriving in ${countdown}s...`;
      if (countdown <= 0) clearInterval(cdInterval);
    }, 1000);

    state.reorderTimer = setTimeout(() => {
      clearInterval(cdInterval);
      const addQty = Math.min(REORDER_QTY, WAREHOUSE_CAP - state.warehouse);
      state.warehouse += addQty;
      showAlert(`📦 +${addQty} units arrived in warehouse!`, 'alert-yellow');
      updateUI();

      // Start cooldown
      state.reorderState = 'cooldown';
      let cooldownLeft = REORDER_COOLDOWN / 1000;
      DOM.reorderStatus.textContent = `Cooldown: ${cooldownLeft}s`;
      updateUI();

      const coolCD = setInterval(() => {
        cooldownLeft--;
        DOM.reorderStatus.textContent = `Cooldown: ${cooldownLeft}s`;
        if (cooldownLeft <= 0) {
          clearInterval(coolCD);
          state.reorderState = 'ready';
          DOM.reorderStatus.textContent = 'Ready';
          updateUI();
        }
      }, 1000);
      state.cooldownTimer = coolCD;
    }, REORDER_DELIVERY_TIME);
  }

  function pushToPlat(platform) {
    if (state.warehouse <= 0 || !state.running) return;
    state.warehouse--;
    state.platformStock[platform]++;
    updateUI();
  }

  // ========== EDGELAB ==========
  function activateEdgeLab() {
    if (state.edgelabActive || !state.running) return;
    state.edgelabActive = true;

    // Stop order spawner
    clearTimeout(state.orderInterval);

    // Clear all pending orders
    PLATFORMS.forEach(p => {
      state.orders[p].forEach(o => {
        clearInterval(o.tickInterval);
        o.element?.remove();
      });
      state.orders[p] = [];
    });

    // Clear tick intervals
    state.orderTickIntervals.forEach(i => clearInterval(i));
    state.orderTickIntervals = [];

    // Sync stock — merge everything
    const total = PLATFORMS.reduce((s, p) => s + state.platformStock[p], 0) + state.warehouse;
    // Give a generous restock when EdgeLab activates (simulating smart restocking)
    const boostedTotal = Math.max(total, 15);
    PLATFORMS.forEach(p => state.platformStock[p] = Math.floor(boostedTotal / 3));
    const remainder = boostedTotal - Math.floor(boostedTotal / 3) * 3;
    state.platformStock[PLATFORMS[0]] += remainder;
    state.warehouse = 0;

    DOM.edgelabOverlay.classList.remove('hidden');
    updateUI();

    // Auto-fulfill orders in EdgeLab mode
    state.edgelabInterval = setInterval(() => {
      if (!state.running) return;
      const platform = PLATFORMS[rand(0, 2)];
      let totalStock = PLATFORMS.reduce((s, p) => s + state.platformStock[p], 0);

      // Auto-restock if low (EdgeLab handles this)
      if (totalStock <= 3) {
        PLATFORMS.forEach(p => state.platformStock[p] += 3);
        totalStock = PLATFORMS.reduce((s, p) => s + state.platformStock[p], 0);
      }

      if (totalStock > 0) {
        // Find a platform with stock
        let p = platform;
        if (state.platformStock[p] <= 0) {
          p = PLATFORMS.find(pp => state.platformStock[pp] > 0) || platform;
        }
        state.platformStock[p]--;
        changeBalance(PRICES.fulfilled, 'revenue');

        // Show in EdgeLab orders
        const names = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok Shop' };
        const item = document.createElement('div');
        item.className = 'edgelab-order-item';
        item.innerHTML = `
          <span class="order-platform">${names[p]} — Order #${nextOrderId++}</span>
          <span class="order-status-badge">✓ Auto-fulfilled</span>
        `;
        DOM.edgelabOrders.prepend(item);
        while (DOM.edgelabOrders.children.length > 8) {
          DOM.edgelabOrders.lastChild.remove();
        }
        updateUI();
      }
    }, 1500);
  }

  // ========== TIMER ==========
  function startTimer() {
    state.timerInterval = setInterval(() => {
      if (!state.running) return;
      state.timeLeft--;
      updateUI();
      if (state.timeLeft <= 0) {
        endGame('timeout');
      }
    }, 1000);
  }

  // ========== GAME LIFECYCLE ==========
  function startGame() {
    const cfg = CONFIG[state.difficulty];

    // Reset state
    state.running = true;
    state.balance = 200;
    state.missedSales = 0;
    state.revenue = 0;
    state.penalties = 0;
    state.restockCost = 0;
    state.timeLeft = cfg.duration;
    state.totalTime = cfg.duration;
    state.warehouse = 0;
    state.orderCounter = 0;
    state.edgelabActive = false;
    state.oversellCount = 0;
    state.penaltyCount = 0;
    state.reorderState = 'ready';
    state.platformStock = {
      shopee: Math.floor(cfg.startStock / 3) + 1,
      lazada: Math.floor(cfg.startStock / 3) + 1,
      tiktok: cfg.startStock - (Math.floor(cfg.startStock / 3) + 1) * 2,
    };
    state.orders = { shopee: [], lazada: [], tiktok: [] };
    nextOrderId = 1;

    // Clear previous intervals
    clearAllIntervals();

    // Clear UI
    PLATFORMS.forEach(p => $(`#orders-${p}`).innerHTML = '');
    DOM.alertContainer.innerHTML = '';
    DOM.edgelabOverlay.classList.add('hidden');
    DOM.edgelabOrders.innerHTML = '';
    DOM.reorderStatus.textContent = 'Ready';
    DOM.btnReorder.classList.remove('shipping');

    updateUI();
    showScreen('game-screen');

    // Start systems
    startTimer();
    startOrderSpawning();
  }

  function endGame(reason) {
    state.running = false;
    clearAllIntervals();

    // Set end screen content
    const isInsolvent = reason === 'insolvent';

    $('#end-icon').textContent = isInsolvent ? '💀' : '📊';
    $('#end-title').textContent = isInsolvent ? 'BUSINESS INSOLVENT' : "Time's Up";
    $('#end-subtitle').textContent = isInsolvent ? 'Your balance dropped below -$150.' : "Here's your P&L.";

    $('#end-revenue').textContent = `+$${state.revenue}`;
    $('#end-penalties').textContent = `-$${state.penalties}`;
    $('#end-restock-cost').textContent = `-$${state.restockCost}`;
    $('#end-missed').textContent = `$${state.missedSales}`;

    const finalBal = state.balance;
    $('#end-balance').textContent = `$${finalBal}`;
    const balEl = $('#end-balance');
    balEl.style.color = finalBal >= 100 ? 'var(--green)' : finalBal >= 0 ? 'var(--yellow)' : 'var(--red)';

    // Determine message
    let msg;
    if (isInsolvent) {
      msg = 'Your store collapsed under the weight of overselling and penalties.';
    } else if (finalBal < 0) {
      msg = '"Your store is bleeding money." — You need EdgeLab.';
    } else if (finalBal < 100) {
      msg = '"Surviving, but barely." — EdgeLab stops the bleeding.';
    } else {
      msg = '"Impressive — but unsustainable at scale." — EdgeLab makes it effortless.';
    }
    $('#end-message').textContent = msg;

    // Pitch section
    $('#pitch-penalties').textContent = `$${state.penalties}`;
    $('#pitch-missed').textContent = `$${state.missedSales}`;

    showScreen('end-screen');
  }

  function clearAllIntervals() {
    clearInterval(state.timerInterval);
    clearTimeout(state.orderInterval);
    clearTimeout(state.reorderTimer);
    clearInterval(state.cooldownTimer);
    clearInterval(state.edgelabInterval);
    state.orderTickIntervals.forEach(i => clearInterval(i));
    state.orderTickIntervals = [];
    PLATFORMS.forEach(p => {
      state.orders[p].forEach(o => clearInterval(o.tickInterval));
    });
  }

  // ========== EVENT LISTENERS ==========
  function init() {
    // Difficulty selector
    $$('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.diff-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.difficulty = btn.dataset.difficulty;
      });
    });

    // Start
    DOM.btnStart.addEventListener('click', startGame);

    // Restart
    DOM.btnRestart.addEventListener('click', () => showScreen('start-screen'));

    // Reorder
    DOM.btnReorder.addEventListener('click', reorderStock);

    // Push stock
    $$('.btn-push').forEach(btn => {
      btn.addEventListener('click', () => pushToPlat(btn.dataset.platform));
    });

    // EdgeLab
    DOM.btnEdgelab.addEventListener('click', activateEdgeLab);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!state.running) return;
      if (e.key === 'r' || e.key === 'R') reorderStock();
      if (e.key === '1') pushToPlat('shopee');
      if (e.key === '2') pushToPlat('lazada');
      if (e.key === '3') pushToPlat('tiktok');
    });
  }

  init();
})();
