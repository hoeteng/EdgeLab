(() => {
  'use strict';

  const CONFIG = {
    demo: {
      duration: 70,
      warehouseStart: 24,
      phaseEnds: { setup: 4, calm: 9, pressure: 23 },
      calm: { gap: [2600, 3400], orders: [1, 2], timer: [7400, 9000], qty: [1, 2] },
      pressure: { gap: [1500, 2200], orders: [1, 2], timer: [5000, 6400], qty: [1, 3] },
      chaos: { gap: [800, 1200], orders: [2, 3], timer: [3200, 4400], qty: [2, 5] },
      modalTriggerAt: 30,
    },
  };

  const REORDER_DELIVERY_MS = 12000;
  const ONBOARDING_STEP_MS = 2200;
  const PLATFORMS = ['shopee', 'lazada', 'tiktok'];
  const ORDER_TICK_MS = 50;

  let nextOrderId = 1;

  const state = {
    difficulty: 'demo',
    running: false,
    paused: false,
    pauseReason: '',
    missedSales: 0,
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
    onboardingRunning: false,
    onboardingTimers: [],
    tutorialRunning: false,
    tutorialTimers: [],
    guideActive: false,
    guideMode: '',
    guideStepIndex: 0,
    guideSteps: [],
    guideLocksGame: false,
    forecast: { shopee: 0, lazada: 0, tiktok: 0 },
    oversellCount: 0,
    lastAutoOrderedQty: 0,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const DOM = {
    startScreen: $('#start-screen'),
    gameScreen: $('#game-screen'),
    endScreen: $('#end-screen'),
    btnStart: $('#btn-start'),
    btnRestart: $('#btn-restart'),
    lostSales: $('#lost-sales'),
    lostDelta: $('#lost-delta'),
    oversellCount: $('#oversell-count'),
    oversellDelta: $('#oversell-delta'),
    timer: $('#timer'),
    warehouse: $('#warehouse-stock'),
    btnReorder: $('#btn-reorder'),
    btnReorderLabel: $('#btn-reorder-label'),
    reorderQtyDisplay: $('#reorder-qty-display'),
    reorderStatus: $('#reorder-status'),
    setupHint: $('#setup-hint'),
    guideOverlay: $('#guide-overlay'),
    guideBubble: $('#guide-bubble'),
    guideStep: $('#guide-step'),
    guideCopy: $('#guide-copy-text'),
    guideProgress: $('#guide-progress'),
    guideNext: $('#guide-next'),
    tutorialCallout: $('#tutorial-callout'),
    tutorialStep: $('#tutorial-step'),
    tutorialCopy: $('#tutorial-copy'),
    forecastStrip: $('#forecast-strip'),
    forecastSummary: $('#forecast-summary'),
    forecastReorder: $('#forecast-reorder'),
    alertContainer: $('#alert-container'),
    modal: $('#edgelab-modal'),
    modalLost: $('#modal-lost'),
    modalOversell: $('#modal-oversell'),
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
    return amount > 0 ? `+${amount}` : String(amount);
  }

  function showScreen(id) {
    $$('.screen').forEach((screen) => screen.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function isInteractionLocked() {
    return state.paused && state.pauseReason !== 'guide';
  }

  function showAlert(message, tone = 'alert-yellow') {
    const toast = document.createElement('div');
    toast.className = `alert-toast ${tone}`;
    toast.textContent = message;
    DOM.alertContainer.style.display = 'grid';
    DOM.alertContainer.prepend(toast);

    setTimeout(() => {
      toast.remove();
      if (!DOM.alertContainer.children.length) {
        DOM.alertContainer.style.display = 'none';
      }
    }, 2700);
  }

  const deltaTimers = {
    lost: null,
    oversell: null,
  };

  function showIndicatorDelta(kind, amount) {
    if (!amount) {
      return;
    }

    const deltaEl = kind === 'lost' ? DOM.lostDelta : DOM.oversellDelta;
    clearTimeout(deltaTimers[kind]);
    deltaEl.textContent = formatDelta(amount);
    deltaEl.classList.remove('hidden', 'lost', 'oversell');
    deltaEl.classList.add(kind);
    deltaTimers[kind] = setTimeout(() => {
      deltaEl.classList.add('hidden');
    }, 1100);
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
      const num = document.getElementById(`forecast-num-${platform}`);
      const value = state.forecast[platform] || 0;
      num.textContent = `${value}u`;
    });
    DOM.forecastReorder.textContent = `${state.lastAutoOrderedQty}u`;
  }

  function updateReorderUI() {
    DOM.btnReorderLabel.textContent = `Order ${state.reorderSelection}`;
    DOM.reorderQtyDisplay.textContent = state.reorderSelection;
    DOM.btnReorder.disabled = !state.running || isInteractionLocked() || state.edgelabActive || state.reorderState !== 'ready';
    DOM.btnReorder.classList.toggle('shipping', state.reorderState === 'shipping');

    DOM.reorderStatus.className = 'reorder-status hidden';
    if (state.edgelabActive) {
      DOM.reorderStatus.classList.remove('hidden');
      DOM.reorderStatus.textContent = 'Auto-order on';
      return;
    }

    if (state.reorderState === 'shipping') {
      DOM.reorderStatus.classList.remove('hidden');
      DOM.reorderStatus.classList.add('active');
    }
  }

  function updateUI() {
    const cfg = CONFIG[state.difficulty];
    DOM.lostSales.textContent = String(state.missedSales);
    DOM.oversellCount.textContent = String(state.oversellCount);
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
      && !state.guideActive
      && getElapsedSeconds() < cfg.phaseEnds.setup;
    DOM.setupHint.classList.toggle('hidden', !setupVisible);

    $$('.btn-stock-step').forEach((button) => {
      const platform = button.dataset.platform;
      const action = button.dataset.action;
      button.disabled = !state.running
        || isInteractionLocked()
        || state.edgelabActive
        || (action === 'dec' && state.platformStock[platform] <= 0);
    });

    $$('.btn-reorder-step').forEach((button) => {
      const action = button.dataset.action;
      button.disabled = !state.running
        || isInteractionLocked()
        || state.edgelabActive
        || state.reorderState !== 'ready'
        || (action === 'dec' && state.reorderSelection <= 1)
        || (action === 'inc' && state.reorderSelection >= 20);
    });

    DOM.modalLost.textContent = String(state.missedSales);
    DOM.modalOversell.textContent = String(state.oversellCount);

    updateReorderUI();
    updateForecastUI();
    refreshQueuePlaceholders();
  }

  function addMissedSale(platform, qty, source = 'manual') {
    state.missedSales += qty;
    showIndicatorDelta('lost', qty);
    showAlert(`Lost +${qty}`, 'alert-orange');

    if (source === 'manual') {
      flashPanel(platform);
    }

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
    state.oversellCount += qty;
    showIndicatorDelta('oversell', qty);
    showAlert(`Oversell +${qty}`, 'alert-red');
    if (!auto) {
      flashPanel(platform);
    }
    updateUI();
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
    state.warehouse = Math.max(0, state.warehouse - fulfilledQty);

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

    addMissedSale(order.platform, order.qty);
    removeOrderFromState(order);
    finalizeOrderCard(order, 'expired', 500);
    updateUI();
  }

  function createAutoOrder(platform, qty) {
    if (!state.running || state.paused || !state.edgelabActive || qty <= 0) {
      return;
    }

    const order = {
      id: nextOrderId++,
      platform,
      qty,
      element: null,
    };

    state.warehouse = Math.max(0, state.warehouse - order.qty);
    syncPlatformsToWarehouse();

    const card = document.createElement('div');
    card.className = 'order-card auto-fulfilled';
    card.innerHTML = `
      <div class="order-top-row">
        <span class="order-id">Order #${String(order.id).padStart(2, '0')}</span>
        <span class="order-qty">Qty ${order.qty}</span>
      </div>
      <div class="order-meta-row">
        <span class="auto-status status-success">Matched</span>
        <span>Forecast ${order.qty}u</span>
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

  function getForecastTotal() {
    return PLATFORMS.reduce((sum, platform) => sum + (state.forecast[platform] || 0), 0);
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

    const total = getForecastTotal();
    DOM.forecastSummary.textContent = `Incoming ${total}u`;
    updateForecastUI();
    return total;
  }

  function clearGuideFocus() {
    $$('.tutorial-focus-shell').forEach((node) => node.classList.remove('tutorial-focus-shell'));
    $$('.tutorial-focus-target').forEach((node) => node.classList.remove('tutorial-focus-target'));
    DOM.guideOverlay.classList.add('hidden');
    DOM.guideOverlay.setAttribute('aria-hidden', 'true');
    DOM.guideBubble.classList.remove('place-top', 'place-bottom');
    DOM.guideBubble.style.top = '';
    DOM.guideBubble.style.left = '';
  }

  function removeGuideSampleOrder() {
    document.querySelector('.guide-sample-order')?.remove();
    refreshQueuePlaceholders();
  }

  function ensureGuideSampleOrder() {
    const queue = document.getElementById('orders-shopee');
    if (queue.querySelector('.guide-sample-order')) {
      return;
    }

    queue.querySelector('.order-empty')?.remove();
    const card = document.createElement('div');
    card.className = 'order-card guide-sample-order';
    card.innerHTML = `
      <div class="order-top-row">
        <span class="order-id">Sample Order</span>
        <span class="order-qty">Qty 2</span>
      </div>
      <div class="order-timer-bar">
        <div class="order-timer-fill"></div>
      </div>
      <button class="btn-fulfill" disabled>Pack Order</button>
    `;
    queue.prepend(card);
  }

  function positionGuideBubble(target) {
    requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      const bubbleRect = DOM.guideBubble.getBoundingClientRect();
      const placeAbove = rect.top > window.innerHeight * 0.52;
      let top = placeAbove
        ? rect.top - bubbleRect.height - 18
        : rect.bottom + 18;

      if (top < 16) {
        top = rect.bottom + 18;
      }
      if (top + bubbleRect.height > window.innerHeight - 16) {
        top = rect.top - bubbleRect.height - 18;
      }

      const left = Math.min(
        Math.max(rect.left + (rect.width / 2) - (bubbleRect.width / 2), 16),
        window.innerWidth - bubbleRect.width - 16,
      );

      DOM.guideBubble.style.top = `${top}px`;
      DOM.guideBubble.style.left = `${left}px`;
      DOM.guideBubble.classList.toggle('place-top', top < rect.top);
      DOM.guideBubble.classList.toggle('place-bottom', top >= rect.top);
    });
  }

  function showGuideStep(step) {
    if (step.sampleOrder) {
      ensureGuideSampleOrder();
    } else {
      removeGuideSampleOrder();
    }

    clearGuideFocus();

    const target = document.querySelector(step.target);
    const shell = document.querySelector(step.shell);
    if (!target || !shell) {
      return;
    }

    shell.classList.add('tutorial-focus-shell');
    target.classList.add('tutorial-focus-target');
    state.guideActive = true;
    state.guideStepIndex = step.index;
    DOM.guideStep.textContent = step.title;
    DOM.guideCopy.textContent = step.copy;
    DOM.guideProgress.textContent = `${step.index + 1} / ${state.guideSteps.length}`;
    DOM.guideOverlay.classList.remove('hidden');
    DOM.guideOverlay.setAttribute('aria-hidden', 'false');
    positionGuideBubble(target);
  }

  function finishOnboarding() {
    state.onboardingRunning = false;
    state.onboardingTimers.forEach((timer) => clearTimeout(timer));
    state.onboardingTimers = [];
    state.guideActive = false;
    state.guideSteps = [];
    state.guideStepIndex = 0;
    clearGuideFocus();
    removeGuideSampleOrder();

    if (state.pauseReason === 'guide') {
      state.paused = false;
      state.pauseReason = '';
      state.nextWaveAt = Date.now() + 4000;
    }

    updateUI();
  }

  function startOnboarding() {
    state.onboardingRunning = true;
    state.paused = true;
    state.pauseReason = 'guide';

    const steps = [
      {
        title: 'List Stock',
        copy: 'Tap + to list stock on a channel.',
        target: '#panel-shopee .btn-stock-step[data-action="inc"]',
        shell: '#panel-shopee',
      },
      {
        title: 'Pull Back',
        copy: 'Tap - if you listed too much.',
        target: '#panel-shopee .btn-stock-step[data-action="dec"]',
        shell: '#panel-shopee',
      },
      {
        title: 'Buy Stock',
        copy: 'Use Buy Stock to refill the warehouse.',
        target: '#btn-reorder',
        shell: '#warehouse-hub',
      },
      {
        title: 'Pack Orders',
        copy: 'Pack each order before its timer runs out.',
        target: '.guide-sample-order .btn-fulfill',
        shell: '#panel-shopee',
        sampleOrder: true,
      },
    ];
    state.guideSteps = steps;
    state.guideStepIndex = 0;

    steps.forEach((step, index) => {
      const timer = setTimeout(() => {
        if (!state.running || !state.onboardingRunning) {
          return;
        }

        if (index === steps.length) {
          finishOnboarding();
          return;
        }

        showGuideStep({ ...step, index });
      }, index * ONBOARDING_STEP_MS);
      state.onboardingTimers.push(timer);
    });

    const finishTimer = setTimeout(() => {
      if (state.running && state.onboardingRunning) {
        finishOnboarding();
      }
    }, steps.length * ONBOARDING_STEP_MS);
    state.onboardingTimers.push(finishTimer);
    updateUI();
  }

  function autoRestockFromForecast() {
    if (!state.edgelabActive) {
      return;
    }

    const forecastTotal = getForecastTotal();
    const target = forecastTotal;
    state.lastAutoOrderedQty = 0;

    if (state.warehouse < target) {
      const needed = target - state.warehouse;
      state.lastAutoOrderedQty = needed;
      state.warehouse += needed;
      syncPlatformsToWarehouse();
      showAlert(`+${needed}u`, 'alert-green');
    }

    updateForecastUI();
  }

  function prepareEdgeLabWave(delayMs) {
    const { config } = getPhaseConfig();
    if (!config) {
      return;
    }

    buildForecast();
    autoRestockFromForecast();
    state.nextWaveAt = Date.now() + delayMs;
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
    autoRestockFromForecast();

    showTutorial('Sync On', 'All channels match.');

    const stepTwoTimer = setTimeout(() => {
      buildForecast();
      autoRestockFromForecast();
      showTutorial('Forecast On', 'Forecast = arrivals.');
    }, 3200);

    const finishTimer = setTimeout(() => {
      state.tutorialRunning = false;
      state.paused = false;
      state.pauseReason = '';
      state.nextWaveAt = Date.now() + 1500;
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
      updateUI();
    }
  }

  function adjustPlatformStock(platform, delta) {
    if (!state.running || isInteractionLocked() || state.edgelabActive) {
      return;
    }

    const previousClaimed = PLATFORMS.reduce((sum, key) => sum + state.platformStock[key], 0);
    state.platformStock[platform] = Math.max(0, state.platformStock[platform] + delta);
    const claimed = PLATFORMS.reduce((sum, key) => sum + state.platformStock[key], 0);

    if (previousClaimed <= state.warehouse && claimed > state.warehouse) {
      showAlert(`${claimed} listed / ${state.warehouse} real`, 'alert-red');
    }

    updateUI();
  }

  function reorderStock() {
    if (!state.running || isInteractionLocked() || state.edgelabActive || state.reorderState !== 'ready') {
      return;
    }

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
        const deliveredQty = state.reorderPendingQty;
        state.warehouse += deliveredQty;
        state.reorderPendingQty = 0;
        state.reorderState = 'ready';
        showAlert(`Stock +${deliveredQty}`, 'alert-yellow');
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

    if (state.edgelabActive) {
      PLATFORMS.forEach((platform) => {
        createAutoOrder(platform, state.forecast[platform] || 0);
      });
      prepareEdgeLabWave(rand(config.gap[0], config.gap[1]));
      return;
    }

    const count = rand(config.orders[0], config.orders[1]);
    const shuffled = [...PLATFORMS].sort(() => Math.random() - 0.5);

    for (let i = 0; i < count; i += 1) {
      const platform = shuffled[i % shuffled.length];
      createManualOrder(platform, config);
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
          if (!state.edgelabActive) {
            state.nextWaveAt = Date.now() + rand(config.gap[0], config.gap[1]);
          }
        }
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
    state.onboardingTimers.forEach((timer) => clearTimeout(timer));
    state.onboardingTimers = [];

    PLATFORMS.forEach((platform) => {
      state.orders[platform].forEach((order) => clearInterval(order.tickInterval));
    });
  }

  function resetGameState() {
    const cfg = CONFIG[state.difficulty];
    clearAllIntervals();
    nextOrderId = 1;
    clearTimeout(deltaTimers.lost);
    clearTimeout(deltaTimers.oversell);

    state.running = true;
    state.paused = false;
    state.pauseReason = '';
    state.missedSales = 0;
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
    state.onboardingRunning = false;
    state.tutorialRunning = false;
    state.forecast = { shopee: 0, lazada: 0, tiktok: 0 };
    state.oversellCount = 0;
    state.lastAutoOrderedQty = 0;
    state.nextWaveAt = Date.now() + 1200;

    document.body.classList.remove('edgelab-active');
    DOM.modal.classList.add('hidden');
    hideTutorial();
    clearGuideFocus();
    removeGuideSampleOrder();
    DOM.alertContainer.innerHTML = '';
    DOM.lostDelta.classList.add('hidden');
    DOM.oversellDelta.classList.add('hidden');

    PLATFORMS.forEach((platform) => {
      const queue = document.getElementById(`orders-${platform}`);
      queue.innerHTML = '';
    });

    refreshQueuePlaceholders();
  }

  function startGame() {
    resetGameState();
    showScreen('game-screen');
    startOnboarding();
    updateUI();
    startTimer();
    runGameLoop();
  }

  function endGame(reason) {
    state.running = false;
    state.paused = false;
    clearAllIntervals();
    DOM.modal.classList.add('hidden');
    hideTutorial();

    $('#end-icon').textContent = state.edgelabActive ? '✨' : '📊';
    $('#end-title').textContent = state.edgelabActive ? 'EdgeLab Won' : "Time's Up";
    $('#end-subtitle').textContent = state.edgelabActive
      ? 'Ops stayed under control.'
      : 'Ops recap.';

    $('#end-lost').textContent = String(state.missedSales);
    $('#end-oversells').textContent = String(state.oversellCount);
    $('#pitch-lost').textContent = String(state.missedSales);
    $('#pitch-oversells').textContent = String(state.oversellCount);

    let message = 'Manual stock drifted out of control.';
    if (state.edgelabActive) {
      message = 'Sync and forecasting cut the damage fast.';
    } else if (state.oversellCount >= state.missedSales) {
      message = 'Oversells hit before the channels could react.';
    } else if (state.missedSales > 0) {
      message = 'Demand arrived faster than the listings could keep up.';
    }

    $('#end-message').textContent = message;
    showScreen('end-screen');
  }

  function initEventListeners() {
    DOM.btnStart.addEventListener('click', startGame);
    DOM.btnRestart.addEventListener('click', () => showScreen('start-screen'));
    DOM.btnReorder.addEventListener('click', reorderStock);
    DOM.btnActivateEdgeLab.addEventListener('click', activateEdgeLab);
    DOM.btnCloseModal.addEventListener('click', closeModalResumeGame);

    $$('.btn-reorder-step').forEach((button) => {
      button.addEventListener('click', () => {
        if (!state.running || isInteractionLocked() || state.edgelabActive || state.reorderState !== 'ready') {
          return;
        }
        const nextValue = state.reorderSelection + (button.dataset.action === 'inc' ? 1 : -1);
        state.reorderSelection = Math.max(1, Math.min(20, nextValue));
        updateUI();
      });
    });

    $$('.btn-stock-step').forEach((button) => {
      button.addEventListener('click', () => {
        adjustPlatformStock(button.dataset.platform, button.dataset.action === 'inc' ? 1 : -1);
      });
    });

    DOM.guideNext.addEventListener('click', () => {
      if (state.onboardingRunning) {
        finishOnboarding();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (!state.running || isInteractionLocked()) {
        return;
      }

      if (event.key === 'r' || event.key === 'R') {
        reorderStock();
      }
      if (event.key === '1') {
        adjustPlatformStock('shopee', 1);
      }
      if (event.key === '2') {
        adjustPlatformStock('lazada', 1);
      }
      if (event.key === '3') {
        adjustPlatformStock('tiktok', 1);
      }
    });
  }

  initEventListeners();
  updateUI();
  refreshQueuePlaceholders();
})();
