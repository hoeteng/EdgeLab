(() => {
  'use strict';

  const CONFIG = {
    easy: {
      duration: 70,
      startBalance: 0,
      warehouseStart: 28,
      phaseEnds: { setup: 6, calm: 20, pressure: 36 },
      calm: { gap: [4300, 5200], orders: [1, 1], timer: [9000, 11000], qty: [1, 2] },
      pressure: { gap: [2600, 3400], orders: [1, 2], timer: [6500, 8200], qty: [1, 3] },
      chaos: { gap: [1400, 1900], orders: [2, 3], timer: [4200, 5600], qty: [2, 4] },
      modalTriggerAt: 48,
    },
    normal: {
      duration: 70,
      startBalance: 0,
      warehouseStart: 24,
      phaseEnds: { setup: 6, calm: 18, pressure: 32 },
      calm: { gap: [4000, 5000], orders: [1, 1], timer: [8200, 9800], qty: [1, 2] },
      pressure: { gap: [2400, 3200], orders: [1, 2], timer: [5600, 7200], qty: [1, 3] },
      chaos: { gap: [1200, 1800], orders: [2, 3], timer: [3800, 5000], qty: [2, 5] },
      modalTriggerAt: 45,
    },
    demo: {
      duration: 70,
      startBalance: 0,
      warehouseStart: 24,
      phaseEnds: { setup: 6, calm: 18, pressure: 32 },
      calm: { gap: [4200, 5000], orders: [1, 1], timer: [8200, 9800], qty: [1, 2] },
      pressure: { gap: [2400, 3100], orders: [1, 2], timer: [5600, 7000], qty: [1, 3] },
      chaos: { gap: [1100, 1600], orders: [2, 3], timer: [3600, 4700], qty: [2, 5] },
      modalTriggerAt: 45,
    },
  };

  const PRICES = {
    fulfilled: 18,
    oversold: -34,
    skipped: -8,
    reorderUnit: -12,
    missedSale: 18,
  };

  const REORDER_DELIVERY_MS = 12000;
  const INSOLVENCY_THRESHOLD = -280;
  const PLATFORMS = ['shopee', 'lazada', 'tiktok'];
  const PLATFORM_NAMES = {
    shopee: 'Shopee',
    lazada: 'Lazada',
    tiktok: 'TikTok Shop',
  };
  const ORDER_TICK_MS = 50;

  let nextOrderId = 1;

  const state = {
    difficulty: 'demo',
    running: false,
    paused: false,
    pauseReason: '',
    balance: 0,
    missedSales: 0,
    revenue: 0,
    penalties: 0,
    restockCost: 0,
    timeLeft: 70,
    totalTime: 70,
    warehouse: 24,
    platformStock: { shopee: 0, lazada: 0, tiktok: 0 },
    orders: { shopee: [], lazada: [], tiktok: [] },
    reorderSelection: 5,
    reorderState: 'ready',
    reorderCountdownInterval: null,
    reorderSecondsLeft: 0,
    reorderPendingQty: 0,
    timerInterval: null,
    gameLoopInterval: null,
    nextWaveAt: 0,
    modalShown: false,
    edgelabActive: false,
    tutorialRunning: false,
    tutorialTimers: [],
    forecast: { shopee: 0, lazada: 0, tiktok: 0 },
    oversellCount: 0,
    lastAutoRestockAt: 0,
    nextForecastAt: 0,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const DOM = {
    startScreen: $('#start-screen'),
    gameScreen: $('#game-screen'),
    endScreen: $('#end-screen'),
    btnStart: $('#btn-start'),
    btnRestart: $('#btn-restart'),
    balance: $('#balance'),
    missedSales: $('#missed-sales'),
    timer: $('#timer'),
    warehouse: $('#warehouse-stock'),
    btnReorder: $('#btn-reorder'),
    btnReorderLabel: $('#btn-reorder-label'),
    reorderStatus: $('#reorder-status'),
    setupHint: $('#setup-hint'),
    tutorialCallout: $('#tutorial-callout'),
    tutorialStep: $('#tutorial-step'),
    tutorialCopy: $('#tutorial-copy'),
    forecastStrip: $('#forecast-strip'),
    forecastSummary: $('#forecast-summary'),
    forecastReorder: $('#forecast-reorder'),
    alertContainer: $('#alert-container'),
    modal: $('#edgelab-modal'),
    modalOversell: $('#modal-oversell'),
    modalMissed: $('#modal-missed'),
    modalBalance: $('#modal-balance'),
    btnActivateEdgeLab: $('#btn-activate-edgelab'),
    btnCloseModal: $('#btn-close-modal'),
  };

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function formatTime(sec) {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function formatDelta(amount) {
    if (amount > 0) {
      return `+$${amount}`;
    }
    if (amount < 0) {
      return `-$${Math.abs(amount)}`;
    }
    return '$0';
  }

  function showScreen(id) {
    $$('.screen').forEach((screen) => screen.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function showAlert(text, cls = 'alert-red') {
    const toast = document.createElement('div');
    toast.className = `alert-toast ${cls}`;
    toast.textContent = text;
    DOM.alertContainer.prepend(toast);
    setTimeout(() => toast.remove(), 2800);

    while (DOM.alertContainer.children.length > 4) {
      DOM.alertContainer.lastChild.remove();
    }
  }

  function getElapsedSeconds() {
    return state.totalTime - state.timeLeft;
  }

  function getPhaseConfig() {
    const cfg = CONFIG[state.difficulty];
    const elapsed = getElapsedSeconds();

    if (elapsed < cfg.phaseEnds.setup) {
      return { key: 'setup', config: null };
    }
    if (elapsed < cfg.phaseEnds.calm) {
      return { key: 'calm', config: cfg.calm };
    }
    if (elapsed < cfg.phaseEnds.pressure) {
      return { key: 'pressure', config: cfg.pressure };
    }
    return { key: 'chaos', config: cfg.chaos };
  }

  function updateQueuePlaceholder(platform) {
    const queue = document.getElementById(`orders-${platform}`);
    const existing = queue.querySelector('.order-empty');
    const hasCards = queue.querySelector('.order-card');

    if (!hasCards && !existing) {
      const placeholder = document.createElement('div');
      placeholder.className = 'order-empty';
      placeholder.textContent = state.edgelabActive
        ? 'Auto-fill ready.'
        : 'No live orders.';
      queue.appendChild(placeholder);
    }

    if (hasCards && existing) {
      existing.remove();
    }

    if (!hasCards && existing) {
      existing.textContent = state.edgelabActive
        ? 'Auto-fill ready.'
        : 'No live orders.';
    }
  }

  function refreshQueuePlaceholders() {
    PLATFORMS.forEach(updateQueuePlaceholder);
  }

  function updateForecastUI() {
    PLATFORMS.forEach((platform) => {
      const fill = document.getElementById(`forecast-fill-${platform}`);
      const num = document.getElementById(`forecast-num-${platform}`);
      const value = state.forecast[platform] || 0;
      fill.style.width = `${Math.min(100, value * 9)}%`;
      num.textContent = `${value}u`;
    });
  }

  function updateReorderUI() {
    const reorderCost = state.reorderSelection * Math.abs(PRICES.reorderUnit);
    DOM.btnReorderLabel.textContent = `Buy ${state.reorderSelection} — $${reorderCost}`;
    DOM.btnReorder.disabled = !state.running || state.paused || state.edgelabActive || state.reorderState !== 'ready';
    DOM.btnReorder.classList.toggle('shipping', state.reorderState === 'shipping');

    DOM.reorderStatus.className = 'reorder-status';
    if (state.edgelabActive) {
      DOM.reorderStatus.textContent = 'Auto-buy on';
      return;
    }

    if (state.reorderState === 'ready') {
      DOM.reorderStatus.textContent = 'Ready';
      DOM.reorderStatus.classList.add('ready');
    } else if (state.reorderState === 'shipping') {
      DOM.reorderStatus.classList.add('active');
    }
  }

  function updateUI() {
    const cfg = CONFIG[state.difficulty];
    DOM.balance.textContent = formatDelta(state.balance);
    DOM.balance.classList.toggle('negative', state.balance < 0);
    DOM.missedSales.textContent = formatDelta(-state.missedSales);
    DOM.timer.textContent = formatTime(state.timeLeft);
    DOM.timer.classList.toggle('urgent', state.timeLeft <= 10);
    DOM.warehouse.textContent = state.warehouse;

    document.body.classList.toggle('edgelab-active', state.edgelabActive);
    DOM.forecastStrip.classList.toggle('hidden', !state.edgelabActive);

    PLATFORMS.forEach((platform) => {
      const countEl = document.querySelector(`.stock-count[data-platform="${platform}"]`);
      const value = state.platformStock[platform];
      countEl.textContent = value;
      countEl.classList.toggle('low', value > 0 && value <= 3);
      countEl.classList.toggle('out', value <= 0);
      updateQueuePlaceholder(platform);
    });

    const setupVisible = state.running
      && !state.edgelabActive
      && getElapsedSeconds() < cfg.phaseEnds.setup;
    DOM.setupHint.classList.toggle('hidden', !setupVisible);

    $$('.btn-allocate').forEach((button) => {
      button.disabled = !state.running || state.paused || state.edgelabActive;
    });

    $$('.btn-reorder-qty').forEach((button) => {
      button.classList.toggle('selected', Number(button.dataset.qty) === state.reorderSelection);
      button.disabled = !state.running || state.paused || state.edgelabActive || state.reorderState !== 'ready';
    });

    DOM.modalOversell.textContent = String(state.oversellCount);
    DOM.modalMissed.textContent = formatDelta(-state.missedSales);
    DOM.modalBalance.textContent = formatDelta(state.balance);

    updateReorderUI();
    updateForecastUI();
    refreshQueuePlaceholders();
  }

  function changeBalance(amount, reason) {
    state.balance += amount;

    if (amount > 0) {
      state.revenue += amount;
    } else if (reason === 'restock') {
      state.restockCost += Math.abs(amount);
    } else {
      state.penalties += Math.abs(amount);
    }

    DOM.balance.classList.remove('balance-flash-green', 'balance-flash-red');
    void DOM.balance.offsetWidth;
    DOM.balance.classList.add(amount >= 0 ? 'balance-flash-green' : 'balance-flash-red');

    updateUI();

    if (state.balance <= INSOLVENCY_THRESHOLD) {
      endGame('insolvent');
    }
  }

  function addMissedSale(platform, qty, source = 'manual') {
    const value = qty * PRICES.missedSale;
    state.missedSales += value;
    showAlert(`${formatDelta(-value)} Lost`, 'alert-orange');

    if (source === 'manual') {
      flashPanel(platform);
    }

    DOM.missedSales.classList.add('shake');
    setTimeout(() => DOM.missedSales.classList.remove('shake'), 400);
    updateUI();
  }

  function flashPanel(platform) {
    const panel = document.getElementById(`panel-${platform}`);
    panel.classList.add('flash-red');
    setTimeout(() => panel.classList.remove('flash-red'), 550);
  }

  function removeOrderFromState(order) {
    const list = state.orders[order.platform];
    const index = list.indexOf(order);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }

  function finalizeOrderCard(order, className, delay = 450) {
    if (!order.element) {
      return;
    }
    order.element.classList.add(className);
    setTimeout(() => {
      order.element?.remove();
      updateQueuePlaceholder(order.platform);
    }, delay);
  }

  function makeOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.id = `order-${order.id}`;
    card.innerHTML = `
      <div class="order-top-row">
        <span class="order-id">Order #${String(order.id).padStart(2, '0')}</span>
        <span class="order-qty">Qty ${order.qty}</span>
      </div>
      <div class="order-timer-bar">
        <div class="order-timer-fill"></div>
      </div>
      <button class="btn-fulfill">Pack Order</button>
    `;

    const queue = document.getElementById(`orders-${order.platform}`);
    queue.querySelector('.order-empty')?.remove();
    queue.prepend(card);
    order.element = card;

    card.querySelector('.btn-fulfill').addEventListener('click', () => fulfillOrder(order));

    order.tickInterval = setInterval(() => {
      if (!state.running || state.paused) {
        return;
      }

      order.timeRemaining -= ORDER_TICK_MS;
      const fill = card.querySelector('.order-timer-fill');
      const pct = Math.max(0, (order.timeRemaining / order.timerDuration) * 100);
      fill.style.width = `${pct}%`;
      fill.classList.toggle('warning', pct < 50 && pct > 20);
      fill.classList.toggle('critical', pct <= 20);

      if (order.timeRemaining <= 0) {
        clearInterval(order.tickInterval);
        expireOrder(order);
      }
    }, ORDER_TICK_MS);
  }

  function createManualOrder(platform, phaseConfig) {
    if (!state.running || state.paused || state.edgelabActive) {
      return;
    }

    const qty = rand(phaseConfig.qty[0], phaseConfig.qty[1]);

    if (state.platformStock[platform] <= 0) {
      addMissedSale(platform, qty);
      return;
    }

    const order = {
      id: nextOrderId++,
      platform,
      qty,
      timerDuration: rand(phaseConfig.timer[0], phaseConfig.timer[1]),
      timeRemaining: 0,
      element: null,
      tickInterval: null,
    };

    order.timeRemaining = order.timerDuration;
    state.orders[platform].push(order);
    makeOrderCard(order);
    updateQueuePlaceholder(platform);
  }

  function triggerOversell(platform, qty, auto = false) {
    const loss = qty * PRICES.oversold;
    state.oversellCount += qty;
    changeBalance(loss, 'oversell');
    showAlert(`${formatDelta(loss)} Refund`, 'alert-red');
    if (!auto) {
      flashPanel(platform);
    }
  }

  function fulfillOrder(order) {
    if (!state.running || state.paused) {
      return;
    }

    clearInterval(order.tickInterval);
    const availableWarehouse = Math.max(state.warehouse, 0);
    const fulfilledQty = Math.min(order.qty, availableWarehouse);
    const oversoldQty = order.qty - fulfilledQty;

    state.platformStock[order.platform] = Math.max(0, state.platformStock[order.platform] - order.qty);
    state.warehouse -= order.qty;

    if (fulfilledQty > 0) {
      changeBalance(fulfilledQty * PRICES.fulfilled, 'revenue');
      showAlert(`${formatDelta(fulfilledQty * PRICES.fulfilled)} Sale`, 'alert-green');
    }

    if (oversoldQty > 0) {
      triggerOversell(order.platform, oversoldQty);
    }

    removeOrderFromState(order);
    finalizeOrderCard(order, 'fulfilled');
    updateUI();
  }

  function expireOrder(order) {
    if (!state.running) {
      return;
    }

    changeBalance(order.qty * PRICES.skipped, 'skipped');
    showAlert(`${formatDelta(order.qty * PRICES.skipped)} Missed`, 'alert-yellow');
    removeOrderFromState(order);
    finalizeOrderCard(order, 'expired', 500);
    updateUI();
  }

  function createAutoOrder(platform) {
    if (!state.running || state.paused || !state.edgelabActive) {
      return;
    }

    const order = {
      id: nextOrderId++,
      platform,
      qty: rand(getPhaseConfig().config.qty[0], getPhaseConfig().config.qty[1]),
      element: null,
    };

    let statusClass = 'status-success';
    let statusLabel = 'Auto-Fill';
    let cardClass = 'auto-fulfilled';
    let detail = `${formatDelta(order.qty * PRICES.fulfilled)}`;

    if (state.platformStock[platform] > 0 && state.warehouse > 0) {
      const fulfilledQty = Math.min(order.qty, Math.max(state.warehouse, 0));
      const oversoldQty = order.qty - fulfilledQty;
      state.warehouse -= order.qty;
      changeBalance(fulfilledQty * PRICES.fulfilled, 'revenue');
      if (oversoldQty > 0) {
        triggerOversell(platform, oversoldQty, true);
        statusClass = 'status-oversold';
        statusLabel = 'Refund';
        cardClass = 'auto-oversold';
        detail = `Qty ${order.qty}`;
      }
      syncPlatformsToWarehouse();
    } else if (state.platformStock[platform] > 0 && state.warehouse <= 0) {
      state.platformStock[platform] = Math.max(0, state.platformStock[platform] - order.qty);
      state.warehouse -= order.qty;
      triggerOversell(platform, order.qty, true);
      statusClass = 'status-oversold';
      statusLabel = 'Refund';
      cardClass = 'auto-oversold';
      detail = `Qty ${order.qty}`;
    } else {
      addMissedSale(platform, order.qty, 'edgelab');
      statusClass = 'status-missed';
      statusLabel = 'Missed';
      cardClass = 'auto-missed';
      detail = `Qty ${order.qty}`;
    }

    const card = document.createElement('div');
    card.className = `order-card ${cardClass}`;
    card.innerHTML = `
      <div class="order-top-row">
        <span class="order-id">Order #${String(order.id).padStart(2, '0')}</span>
        <span class="order-qty">Qty ${order.qty}</span>
      </div>
      <div class="order-meta-row">
        <span class="auto-status ${statusClass}">${statusLabel}</span>
        <span>${detail}</span>
      </div>
    `;

    const queue = document.getElementById(`orders-${platform}`);
    queue.querySelector('.order-empty')?.remove();
    queue.prepend(card);

    setTimeout(() => {
      card.classList.add('resolved');
      setTimeout(() => {
        card.remove();
        updateQueuePlaceholder(platform);
      }, 500);
    }, 1600);

    updateUI();
  }

  function syncPlatformsToWarehouse() {
    const value = Math.max(state.warehouse, 0);
    PLATFORMS.forEach((platform) => {
      state.platformStock[platform] = value;
    });
    updateUI();
  }

  function buildForecast() {
    const { key } = getPhaseConfig();
    let range;

    if (key === 'calm') {
      range = [3, 5];
    } else if (key === 'pressure') {
      range = [5, 8];
    } else {
      range = [7, 11];
    }

    state.forecast = {
      shopee: rand(range[0], range[1]),
      lazada: rand(Math.max(2, range[0] - 1), Math.max(3, range[1] - 1)),
      tiktok: rand(range[0], range[1] + 1),
    };

    const total = PLATFORMS.reduce((sum, platform) => sum + state.forecast[platform], 0);
    DOM.forecastSummary.textContent = `Next spike: ${total}u`;
    return total;
  }

  function maybeAutoRestockFromForecast(force = false) {
    if (!state.edgelabActive) {
      return;
    }

    const now = Date.now();
    if (!force && now - state.lastAutoRestockAt < 3500) {
      DOM.forecastReorder.textContent = `${state.warehouse}u synced`;
      return;
    }

    const forecastTotal = buildForecast();
    const target = Math.max(forecastTotal + 4, 18);

    if (state.warehouse < target) {
      const needed = target - state.warehouse;
      state.lastAutoRestockAt = now;
      state.warehouse += needed;
      changeBalance(needed * PRICES.reorderUnit, 'restock');
      syncPlatformsToWarehouse();
      DOM.forecastReorder.textContent = `Auto-bought ${needed}u`;
      showAlert(`+${needed}u Stock`, 'alert-green');
    } else {
      DOM.forecastReorder.textContent = `${state.warehouse}u synced`;
    }

    updateForecastUI();
  }

  function showTutorial(stepLabel, copy) {
    DOM.tutorialStep.textContent = stepLabel;
    DOM.tutorialCopy.textContent = copy;
    DOM.tutorialCallout.classList.remove('hidden');
  }

  function hideTutorial() {
    DOM.tutorialCallout.classList.add('hidden');
  }

  function clearManualOrders() {
    PLATFORMS.forEach((platform) => {
      state.orders[platform].forEach((order) => {
        clearInterval(order.tickInterval);
        order.element?.remove();
      });
      state.orders[platform] = [];
    });
    refreshQueuePlaceholders();
  }

  function activateEdgeLab() {
    if (!state.running || state.edgelabActive) {
      return;
    }

    state.edgelabActive = true;
    state.tutorialRunning = true;
    state.paused = true;
    state.pauseReason = 'tutorial';
    state.modalShown = true;

    DOM.modal.classList.add('hidden');
    clearManualOrders();
    buildForecast();
    syncPlatformsToWarehouse();
    maybeAutoRestockFromForecast(true);

    showTutorial('Sync On', 'All channels match.');

    const stepTwoTimer = setTimeout(() => {
      buildForecast();
      maybeAutoRestockFromForecast(true);
      showTutorial('Forecast On', 'Demand auto-stocked.');
    }, 3200);

    const finishTimer = setTimeout(() => {
      state.tutorialRunning = false;
      state.paused = false;
      state.pauseReason = '';
      state.nextForecastAt = Date.now() + 1500;
      hideTutorial();
      showAlert('EdgeLab On', 'alert-green');
      updateUI();
    }, 7600);

    state.tutorialTimers.push(stepTwoTimer, finishTimer);
    updateUI();
  }

  function openModal() {
    if (state.modalShown || state.edgelabActive || !state.running) {
      return;
    }

    state.modalShown = true;
    state.paused = true;
    state.pauseReason = 'modal';
    DOM.modal.classList.remove('hidden');
    updateUI();
  }

  function closeModalResumeGame() {
    DOM.modal.classList.add('hidden');
    if (state.pauseReason === 'modal') {
      state.paused = false;
      state.pauseReason = '';
      showAlert('Manual Mode', 'alert-yellow');
      updateUI();
    }
  }

  function allocatePlatformStock(platform, qty) {
    if (!state.running || state.paused || state.edgelabActive) {
      return;
    }

    const previousClaimed = PLATFORMS.reduce((sum, key) => sum + state.platformStock[key], 0);
    state.platformStock[platform] += qty;
    const claimed = previousClaimed + qty;

    showAlert(`${PLATFORM_NAMES[platform]} +${qty}`, 'alert-green');

    if (previousClaimed <= state.warehouse && claimed > state.warehouse) {
      showAlert(`${claimed} listed / ${state.warehouse} real`, 'alert-red');
    }

    updateUI();
  }

  function reorderStock() {
    if (!state.running || state.paused || state.edgelabActive || state.reorderState !== 'ready') {
      return;
    }

    const cost = state.reorderSelection * PRICES.reorderUnit;
    if (state.balance + cost <= INSOLVENCY_THRESHOLD) {
      showAlert('Too risky', 'alert-red');
      return;
    }

    changeBalance(cost, 'restock');
    showAlert(`${formatDelta(cost)} Buy`, 'alert-yellow');
    state.reorderState = 'shipping';
    state.reorderPendingQty = state.reorderSelection;
    state.reorderSecondsLeft = REORDER_DELIVERY_MS / 1000;
    DOM.reorderStatus.textContent = `ETA ${state.reorderSecondsLeft}s`;
    DOM.reorderStatus.className = 'reorder-status active';
    updateUI();

    state.reorderCountdownInterval = setInterval(() => {
      if (!state.running) {
        clearInterval(state.reorderCountdownInterval);
        state.reorderCountdownInterval = null;
        return;
      }
      if (state.paused) {
        return;
      }
      state.reorderSecondsLeft -= 1;
      if (state.reorderSecondsLeft <= 0) {
        clearInterval(state.reorderCountdownInterval);
        state.reorderCountdownInterval = null;
        state.warehouse += state.reorderPendingQty;
        state.reorderPendingQty = 0;
        state.reorderState = 'ready';
        showAlert(`+${state.reorderSelection}u Stock`, 'alert-yellow');
        updateUI();
      } else {
        DOM.reorderStatus.textContent = `ETA ${state.reorderSecondsLeft}s`;
      }
    }, 1000);
  }

  function spawnWave() {
    const { config } = getPhaseConfig();
    if (!config) {
      return;
    }

    const count = rand(config.orders[0], config.orders[1]);
    const shuffled = [...PLATFORMS].sort(() => Math.random() - 0.5);

    for (let i = 0; i < count; i += 1) {
      const platform = shuffled[i % shuffled.length];
      if (state.edgelabActive) {
        createAutoOrder(platform);
      } else {
        createManualOrder(platform, config);
      }
    }
  }

  function runGameLoop() {
    state.gameLoopInterval = setInterval(() => {
      if (!state.running || state.paused) {
        return;
      }

      const cfg = CONFIG[state.difficulty];
      const elapsed = getElapsedSeconds();

      if (!state.edgelabActive && elapsed >= cfg.modalTriggerAt) {
        openModal();
        return;
      }

      if (Date.now() >= state.nextWaveAt) {
        const { config } = getPhaseConfig();
        if (config) {
          spawnWave();
          state.nextWaveAt = Date.now() + rand(config.gap[0], config.gap[1]);
        }
      }

      if (state.edgelabActive && !state.tutorialRunning && Date.now() >= state.nextForecastAt) {
        maybeAutoRestockFromForecast(false);
        state.nextForecastAt = Date.now() + 4000;
      }
    }, 250);
  }

  function startTimer() {
    state.timerInterval = setInterval(() => {
      if (!state.running || state.paused) {
        return;
      }

      state.timeLeft -= 1;
      updateUI();

      if (state.timeLeft <= 0) {
        endGame('timeout');
      }
    }, 1000);
  }

  function clearAllIntervals() {
    clearInterval(state.timerInterval);
    clearInterval(state.gameLoopInterval);
    clearInterval(state.reorderCountdownInterval);
    state.reorderCountdownInterval = null;
    state.tutorialTimers.forEach((timer) => clearTimeout(timer));
    state.tutorialTimers = [];

    PLATFORMS.forEach((platform) => {
      state.orders[platform].forEach((order) => clearInterval(order.tickInterval));
    });
  }

  function resetGameState() {
    const cfg = CONFIG[state.difficulty];
    clearAllIntervals();
    nextOrderId = 1;

    state.running = true;
    state.paused = false;
    state.pauseReason = '';
    state.balance = cfg.startBalance;
    state.missedSales = 0;
    state.revenue = 0;
    state.penalties = 0;
    state.restockCost = 0;
    state.timeLeft = cfg.duration;
    state.totalTime = cfg.duration;
    state.warehouse = cfg.warehouseStart;
    state.platformStock = { shopee: 0, lazada: 0, tiktok: 0 };
    state.orders = { shopee: [], lazada: [], tiktok: [] };
    state.reorderSelection = 5;
    state.reorderState = 'ready';
    state.reorderSecondsLeft = 0;
    state.reorderPendingQty = 0;
    state.modalShown = false;
    state.edgelabActive = false;
    state.tutorialRunning = false;
    state.forecast = { shopee: 0, lazada: 0, tiktok: 0 };
    state.oversellCount = 0;
    state.lastAutoRestockAt = 0;
    state.nextWaveAt = Date.now() + 1200;
    state.nextForecastAt = Date.now() + 2500;

    document.body.classList.remove('edgelab-active');
    DOM.modal.classList.add('hidden');
    hideTutorial();
    DOM.alertContainer.innerHTML = '';

    PLATFORMS.forEach((platform) => {
      const queue = document.getElementById(`orders-${platform}`);
      queue.innerHTML = '';
    });

    refreshQueuePlaceholders();
  }

  function startGame() {
    resetGameState();
    updateUI();
    showScreen('game-screen');
    startTimer();
    runGameLoop();
  }

  function endGame(reason) {
    state.running = false;
    state.paused = false;
    clearAllIntervals();
    DOM.modal.classList.add('hidden');
    hideTutorial();

    const isInsolvent = reason === 'insolvent';
    $('#end-icon').textContent = isInsolvent ? '💀' : state.edgelabActive ? '✨' : '📊';
    $('#end-title').textContent = isInsolvent ? 'Out of Cash' : state.edgelabActive ? 'EdgeLab Won' : "Time's Up";
    $('#end-subtitle').textContent = isInsolvent
      ? 'Manual ops collapsed.'
      : state.edgelabActive
        ? 'The same chaos became easy.'
        : 'Here is the damage.';

    $('#end-revenue').textContent = formatDelta(state.revenue);
    $('#end-penalties').textContent = formatDelta(-state.penalties);
    $('#end-restock-cost').textContent = formatDelta(-state.restockCost);
    $('#end-missed').textContent = formatDelta(-state.missedSales);
    $('#pitch-penalties').textContent = formatDelta(-state.penalties);
    $('#pitch-missed').textContent = formatDelta(-state.missedSales);

    const balanceEl = $('#end-balance');
    balanceEl.textContent = formatDelta(state.balance);
    balanceEl.style.color = state.balance >= 100 ? 'var(--green)' : state.balance >= 0 ? 'var(--yellow)' : 'var(--red)';

    let message = 'Manual stock drifted out of control.';
    if (isInsolvent) {
      message = 'Refunds and reorders broke the store.';
    } else if (state.edgelabActive) {
      message = 'Sync and forecast turned chaos into flow.';
    } else if (state.oversellCount >= 3) {
      message = 'You sold more than the warehouse could cover.';
    }

    $('#end-message').textContent = message;
    showScreen('end-screen');
  }

  function initEventListeners() {
    $$('.diff-btn').forEach((button) => {
      button.addEventListener('click', () => {
        $$('.diff-btn').forEach((btn) => btn.classList.remove('selected'));
        button.classList.add('selected');
        state.difficulty = button.dataset.difficulty;
      });
    });

    DOM.btnStart.addEventListener('click', startGame);
    DOM.btnRestart.addEventListener('click', () => showScreen('start-screen'));
    DOM.btnReorder.addEventListener('click', reorderStock);
    DOM.btnActivateEdgeLab.addEventListener('click', activateEdgeLab);
    DOM.btnCloseModal.addEventListener('click', closeModalResumeGame);

    $$('.btn-reorder-qty').forEach((button) => {
      button.addEventListener('click', () => {
        if (!state.running || state.paused || state.edgelabActive || state.reorderState !== 'ready') {
          return;
        }
        state.reorderSelection = Number(button.dataset.qty);
        updateUI();
      });
    });

    $$('.btn-allocate').forEach((button) => {
      button.addEventListener('click', () => {
        allocatePlatformStock(button.dataset.platform, Number(button.dataset.qty));
      });
    });

    document.addEventListener('keydown', (event) => {
      if (!state.running || state.paused) {
        return;
      }

      if (event.key === 'r' || event.key === 'R') {
        reorderStock();
      }
      if (event.key === '1') {
        allocatePlatformStock('shopee', 1);
      }
      if (event.key === '2') {
        allocatePlatformStock('lazada', 1);
      }
      if (event.key === '3') {
        allocatePlatformStock('tiktok', 1);
      }
    });
  }

  initEventListeners();
  updateUI();
  refreshQueuePlaceholders();
})();
