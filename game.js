(() => {
  'use strict';

  const CONFIG = {
    easy: {
      duration: 60,
      startBalance: 220,
      warehouseStart: 36,
      phaseEnds: { setup: 5, calm: 20, pressure: 35 },
      calm: { gap: [5200, 6200], orders: [1, 1], timer: [9000, 11000] },
      pressure: { gap: [3600, 4500], orders: [1, 2], timer: [6500, 8000] },
      chaos: { gap: [1900, 2400], orders: [2, 2], timer: [4500, 6000] },
      modalTriggerAt: 29,
    },
    normal: {
      duration: 60,
      startBalance: 200,
      warehouseStart: 30,
      phaseEnds: { setup: 5, calm: 18, pressure: 32 },
      calm: { gap: [4500, 5200], orders: [1, 1], timer: [8000, 9500] },
      pressure: { gap: [2800, 3600], orders: [1, 2], timer: [5200, 6800] },
      chaos: { gap: [1500, 2100], orders: [2, 3], timer: [4200, 5200] },
      modalTriggerAt: 26,
    },
    demo: {
      duration: 60,
      startBalance: 200,
      warehouseStart: 30,
      phaseEnds: { setup: 5, calm: 15, pressure: 25 },
      calm: { gap: [4800, 5400], orders: [1, 1], timer: [8000, 10000] },
      pressure: { gap: [3000, 3800], orders: [1, 2], timer: [5000, 7000] },
      chaos: { gap: [1500, 2000], orders: [2, 3], timer: [4000, 5000] },
      modalTriggerAt: 27,
    },
  };

  const PRICES = {
    fulfilled: 10,
    oversold: -25,
    skipped: -5,
    reorderUnit: -5,
    missedSale: 10,
  };

  const REORDER_DELIVERY_MS = 7000;
  const INSOLVENCY_THRESHOLD = -150;
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
    balance: 200,
    missedSales: 0,
    revenue: 0,
    penalties: 0,
    restockCost: 0,
    timeLeft: 60,
    totalTime: 60,
    warehouse: 30,
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

    while (DOM.alertContainer.children.length > 5) {
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
        ? 'EdgeLab will auto-process new orders here.'
        : 'No live orders yet.';
      queue.appendChild(placeholder);
    }

    if (hasCards && existing) {
      existing.remove();
    }

    if (!hasCards && existing) {
      existing.textContent = state.edgelabActive
        ? 'EdgeLab will auto-process new orders here.'
        : 'No live orders yet.';
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
      fill.style.width = `${Math.min(100, value * 12)}%`;
      num.textContent = `${value} order${value === 1 ? '' : 's'} expected`;
    });
  }

  function updateReorderUI() {
    const reorderCost = state.reorderSelection * Math.abs(PRICES.reorderUnit);
    DOM.btnReorderLabel.textContent = `Reorder ${state.reorderSelection} Units — $${reorderCost}`;
    DOM.btnReorder.disabled = !state.running || state.paused || state.edgelabActive || state.reorderState !== 'ready';
    DOM.btnReorder.classList.toggle('shipping', state.reorderState === 'shipping');

    DOM.reorderStatus.className = 'reorder-status';
    if (state.edgelabActive) {
      DOM.reorderStatus.textContent = 'EdgeLab is auto-restocking.';
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
    DOM.balance.textContent = `$${state.balance}`;
    DOM.balance.classList.toggle('negative', state.balance < 0);
    DOM.missedSales.textContent = `$${state.missedSales}`;
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
    DOM.modalMissed.textContent = `$${state.missedSales}`;
    DOM.modalBalance.textContent = `$${state.balance}`;

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

  function addMissedSale(platform, source = 'manual') {
    const value = PRICES.missedSale;
    state.missedSales += value;
    showAlert(`Missed ${PLATFORM_NAMES[platform]} demand: +$${value} lost`, 'alert-orange');

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
        <span class="order-qty">Qty: 1</span>
      </div>
      <div class="order-timer-bar">
        <div class="order-timer-fill"></div>
      </div>
      <div class="order-meta-row">
        <span>${PLATFORM_NAMES[order.platform]}</span>
        <span>Manual fulfillment</span>
      </div>
      <button class="btn-fulfill">Fulfill Order</button>
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

    if (state.platformStock[platform] <= 0) {
      addMissedSale(platform);
      return;
    }

    const order = {
      id: nextOrderId++,
      platform,
      qty: 1,
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

  function triggerOversell(platform, auto = false) {
    state.oversellCount += 1;
    state.warehouse -= 1;
    changeBalance(PRICES.oversold, 'oversell');
    showAlert(auto ? 'Auto-refund triggered after oversell.' : 'Oversold. Refund required.', 'alert-red');
    flashPanel(platform);
  }

  function fulfillOrder(order) {
    if (!state.running || state.paused) {
      return;
    }

    clearInterval(order.tickInterval);
    state.platformStock[order.platform] = Math.max(0, state.platformStock[order.platform] - 1);

    if (state.warehouse > 0) {
      state.warehouse -= 1;
      changeBalance(PRICES.fulfilled, 'revenue');
      showAlert(`${PLATFORM_NAMES[order.platform]} order fulfilled.`, 'alert-green');
    } else {
      triggerOversell(order.platform);
    }

    removeOrderFromState(order);
    finalizeOrderCard(order, 'fulfilled');
    updateUI();
  }

  function expireOrder(order) {
    if (!state.running) {
      return;
    }

    changeBalance(PRICES.skipped, 'skipped');
    showAlert(`${PLATFORM_NAMES[order.platform]} order expired. -$${Math.abs(PRICES.skipped)}`, 'alert-yellow');
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
      qty: 1,
      element: null,
    };

    let statusClass = 'status-success';
    let statusLabel = 'Auto-fulfilled';
    let cardClass = 'auto-fulfilled';
    let detail = 'Warehouse and platform stock updated instantly.';

    if (state.platformStock[platform] > 0 && state.warehouse > 0) {
      state.warehouse -= 1;
      changeBalance(PRICES.fulfilled, 'revenue');
      syncPlatformsToWarehouse();
    } else if (state.platformStock[platform] > 0 && state.warehouse <= 0) {
      state.platformStock[platform] = Math.max(0, state.platformStock[platform] - 1);
      triggerOversell(platform, true);
      statusClass = 'status-oversold';
      statusLabel = 'Oversold - Refund';
      cardClass = 'auto-oversold';
      detail = 'Platform accepted the order, but the warehouse was empty.';
    } else {
      addMissedSale(platform, 'edgelab');
      statusClass = 'status-missed';
      statusLabel = 'Missed - No platform stock';
      cardClass = 'auto-missed';
      detail = 'Demand arrived before synced stock could be listed.';
    }

    const card = document.createElement('div');
    card.className = `order-card ${cardClass}`;
    card.innerHTML = `
      <div class="order-top-row">
        <span class="order-id">Order #${String(order.id).padStart(2, '0')}</span>
        <span class="auto-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="order-meta-row">
        <span>${PLATFORM_NAMES[platform]}</span>
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
      range = [2, 4];
    } else if (key === 'pressure') {
      range = [3, 6];
    } else {
      range = [5, 8];
    }

    state.forecast = {
      shopee: rand(range[0], range[1]),
      lazada: rand(Math.max(2, range[0] - 1), Math.max(3, range[1] - 1)),
      tiktok: rand(range[0], range[1] + 1),
    };

    const total = PLATFORMS.reduce((sum, platform) => sum + state.forecast[platform], 0);
    DOM.forecastSummary.textContent = `Projected next-wave demand: ${total} orders across all channels.`;
    return total;
  }

  function maybeAutoRestockFromForecast(force = false) {
    if (!state.edgelabActive) {
      return;
    }

    const now = Date.now();
    if (!force && now - state.lastAutoRestockAt < 3500) {
      DOM.forecastReorder.textContent = `Auto-sync active. ${state.warehouse} units available across every channel.`;
      return;
    }

    const forecastTotal = buildForecast();
    const target = Math.max(forecastTotal + 2, 12);

    if (state.warehouse < target) {
      const needed = target - state.warehouse;
      state.lastAutoRestockAt = now;
      state.warehouse += needed;
      changeBalance(needed * PRICES.reorderUnit, 'restock');
      syncPlatformsToWarehouse();
      DOM.forecastReorder.textContent = `Demand spike detected. Auto-reordered ${needed} units and synced every platform.`;
      showAlert(`EdgeLab auto-reordered ${needed} units before stock ran out.`, 'alert-green');
    } else {
      DOM.forecastReorder.textContent = `Auto-sync active. ${state.warehouse} units available across every channel.`;
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

    showTutorial('Step 1', 'Inventory synced. Every platform now mirrors your warehouse in real time.');

    const stepTwoTimer = setTimeout(() => {
      buildForecast();
      maybeAutoRestockFromForecast(true);
      showTutorial('Step 2', 'Demand forecasting is pre-ordering exactly what you need, then syncing every channel.');
    }, 3200);

    const finishTimer = setTimeout(() => {
      state.tutorialRunning = false;
      state.paused = false;
      state.pauseReason = '';
      state.nextForecastAt = Date.now() + 1500;
      hideTutorial();
      showAlert('EdgeLab active. Chaos-level orders are now auto-processing.', 'alert-green');
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
      showAlert('Manual mode resumed. The chaos keeps climbing.', 'alert-yellow');
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

    showAlert(`${PLATFORM_NAMES[platform]} platform stock +${qty}`, 'alert-green');

    if (previousClaimed <= state.warehouse && claimed > state.warehouse) {
      showAlert(`You just promised ${claimed} units across platforms, but only have ${state.warehouse} in the warehouse.`, 'alert-red');
    }

    updateUI();
  }

  function reorderStock() {
    if (!state.running || state.paused || state.edgelabActive || state.reorderState !== 'ready') {
      return;
    }

    const cost = state.reorderSelection * PRICES.reorderUnit;
    if (state.balance + cost <= INSOLVENCY_THRESHOLD) {
      showAlert('Reordering now would push the business into insolvency.', 'alert-red');
      return;
    }

    changeBalance(cost, 'restock');
    state.reorderState = 'shipping';
    state.reorderPendingQty = state.reorderSelection;
    state.reorderSecondsLeft = REORDER_DELIVERY_MS / 1000;
    DOM.reorderStatus.textContent = `Arriving in ${state.reorderSecondsLeft}s`;
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
        showAlert(`${state.reorderSelection} units arrived at the warehouse.`, 'alert-yellow');
        updateUI();
      } else {
        DOM.reorderStatus.textContent = `Arriving in ${state.reorderSecondsLeft}s`;
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
    $('#end-title').textContent = isInsolvent ? 'Business Insolvent' : state.edgelabActive ? 'EdgeLab Took Over' : "Time's Up";
    $('#end-subtitle').textContent = isInsolvent
      ? 'Your balance fell below -$150.'
      : state.edgelabActive
        ? 'You survived the chaos once EdgeLab synced everything.'
        : "Here's your P&L.";

    $('#end-revenue').textContent = `+$${state.revenue}`;
    $('#end-penalties').textContent = `-$${state.penalties}`;
    $('#end-restock-cost').textContent = `-$${state.restockCost}`;
    $('#end-missed').textContent = `$${state.missedSales}`;
    $('#pitch-penalties').textContent = `$${state.penalties}`;
    $('#pitch-missed').textContent = `$${state.missedSales}`;

    const balanceEl = $('#end-balance');
    balanceEl.textContent = `$${state.balance}`;
    balanceEl.style.color = state.balance >= 100 ? 'var(--green)' : state.balance >= 0 ? 'var(--yellow)' : 'var(--red)';

    let message = 'Manual stock allocation kept drifting away from reality.';
    if (isInsolvent) {
      message = 'Your store collapsed under oversells, refunds, and frantic reordering.';
    } else if (state.edgelabActive) {
      message = 'The second EdgeLab synced inventory and forecasted demand, the same chaos became manageable.';
    } else if (state.oversellCount >= 3) {
      message = 'Oversells piled up because your platforms were promising more than the warehouse could deliver.';
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
