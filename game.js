(() => {
  'use strict';

  const CONFIG = {
    demo: {
      duration: 35,
      warehouseStart: 5,
      phaseEnds: { calm: 5, pressure: 11 },
      calm: { gap: [2200, 3000], orders: [1, 1], timer: [2500, 3000], qty: [1, 5] },
      pressure: { gap: [2200, 3000], orders: [1, 1], timer: [2500, 3000], qty: [1, 5] },
      chaos: { gap: [2200, 3000], orders: [1, 1], timer: [2500, 3000], qty: [1, 5] },
      modalTriggerAt: 20,
    },
  };

  const REORDER_DELIVERY_MS = 4000;
  const PLATFORMS = ['shopee', 'lazada', 'tiktok'];
  const ORDER_TICK_MS = 50;

  let nextOrderId = 1;

  const state = {
    difficulty: 'demo',
    running: false,
    paused: false,
    pauseReason: '',
    missedSales: 0,
    timeLeft: 35,
    totalTime: 35,
    warehouse: 15,
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
    tutorialStepIndex: 0,
    tutorialSteps: [],
    guideActive: false,
    guideMode: '',
    guideStepIndex: 0,
    guideSteps: [],
    guideLocksGame: false,
    forecast: { shopee: 0, lazada: 0, tiktok: 0 },
    oversellCount: 0,
    lastAutoOrderedQty: 0,
    comparisonBaseline: { missedSales: 0, oversellCount: 0 },
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
    warehouseHub: $('#warehouse-hub'),
    btnReorder: $('#btn-reorder'),
    btnReorderLabel: $('#btn-reorder-label'),
    reorderStatus: $('#reorder-status'),
    guideOverlay: $('#guide-overlay'),
    guideBubble: $('#guide-bubble'),
    guideStep: $('#guide-step'),
    guideCopy: $('#guide-copy-text'),
    guideProgress: $('#guide-progress'),
    guideNext: $('#guide-next'),
    tutorialCallout: $('#tutorial-callout'),
    tutorialStep: $('#tutorial-step'),
    tutorialCopy: $('#tutorial-copy'),
    tutorialProgress: $('#tutorial-progress'),
    tutorialNext: $('#tutorial-next'),
    syncLayer: $('#sync-layer'),
    forecastStrip: $('#forecast-strip'),
    forecastSummary: $('#forecast-summary'),
    forecastReorder: $('#forecast-reorder'),
    alertContainer: $('#alert-container'),
    modal: $('#edgelab-modal'),
    modalLost: $('#modal-lost'),
    modalOversell: $('#modal-oversell'),
    btnActivateEdgeLab: $('#btn-activate-edgelab'),
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
    return state.paused;
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
      num.textContent = String(value);
    });
    DOM.forecastReorder.textContent = String(state.lastAutoOrderedQty);
  }

  function updateReorderUI() {
    if (DOM.btnReorderLabel) DOM.btnReorderLabel.textContent = `Order ${state.reorderSelection}`;
    if (DOM.btnReorder) DOM.btnReorder.disabled = !state.running || isInteractionLocked() || state.edgelabActive || state.reorderState !== 'ready';
    if (DOM.btnReorder) DOM.btnReorder.classList.toggle('shipping', state.reorderState === 'shipping');

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
    renderSyncMap();
  }

  function clearSyncMap() {
    DOM.syncLayer.innerHTML = '';
    DOM.syncLayer.classList.add('hidden');
  }

  function renderSyncMap() {
    if (!state.running || !state.edgelabActive) {
      clearSyncMap();
      return;
    }

    const gameRect = DOM.gameScreen.getBoundingClientRect();
    const warehouseRect = DOM.warehouseHub.getBoundingClientRect();
    if (!gameRect.width || !gameRect.height || !warehouseRect.width || !warehouseRect.height) {
      clearSyncMap();
      return;
    }

    const startX = (warehouseRect.left + (warehouseRect.width / 2)) - gameRect.left;
    const startY = (warehouseRect.bottom + 8) - gameRect.top;
    const lines = PLATFORMS.map((platform) => {
      const panelEl = document.getElementById(`panel-${platform}`);
      const rect = panelEl?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) {
        return '';
      }

      const endX = (rect.left + (rect.width / 2)) - gameRect.left;
      const endY = (rect.top - 8) - gameRect.top;
      const branchY = startY + Math.max(14, (endY - startY) * 0.52);
      const d = `M ${startX} ${startY} L ${startX} ${branchY} L ${endX} ${branchY} L ${endX} ${endY}`;

      return `
        <path class="sync-link" d="${d}"></path>
        <circle class="sync-node" cx="${endX}" cy="${endY}" r="7"></circle>
      `;
    }).join('');

    DOM.syncLayer.setAttribute('viewBox', `0 0 ${Math.round(gameRect.width)} ${Math.round(gameRect.height)}`);
    DOM.syncLayer.innerHTML = `
      <circle class="sync-node" cx="${startX}" cy="${startY}" r="8"></circle>
      ${lines}
    `;
    DOM.syncLayer.classList.remove('hidden');
  }

  function addMissedSale(platform, qty, source = 'manual') {
    state.missedSales += qty;
    showIndicatorDelta('lost', qty);

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

  function syncOrderTimerUI(card, timeRemaining, timerDuration) {
    const pct = Math.max(0, (timeRemaining / timerDuration) * 100);
    const button = card.querySelector('.btn-fulfill');
    if (!button) {
      return;
    }

    button.style.setProperty('--timer-progress', `${pct}%`);
    button.classList.toggle('warning', pct < 50 && pct > 20);
    button.classList.toggle('critical', pct <= 20);
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
      <button class="btn-fulfill">
        <span class="btn-fulfill-label">Pack Order</span>
      </button>
    `;

    const queue = document.getElementById(`orders-${order.platform}`);
    queue.querySelector('.order-empty')?.remove();
    queue.prepend(card);
    order.element = card;

    card.querySelector('.btn-fulfill').addEventListener('click', () => fulfillOrder(order));
    syncOrderTimerUI(card, order.timeRemaining, order.timerDuration);

    order.tickInterval = setInterval(() => {
      if (!state.running || state.paused) {
        return;
      }

      order.timeRemaining -= ORDER_TICK_MS;
      syncOrderTimerUI(card, order.timeRemaining, order.timerDuration);

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
    if (!auto) {
      flashPanel(platform);
    }
    updateUI();
  }

  function fulfillOrder(order) {
    if (!state.running || state.paused) {
      return;
    }

    if (state.platformStock[order.platform] < order.qty) {
      if (order.element) {
        order.element.classList.remove('vibrate');
        void order.element.offsetWidth; // trigger reflow
        order.element.classList.add('vibrate', 'fulfillment-error');

        const btnLabel = order.element.querySelector('.btn-fulfill-label');
        if (btnLabel) {
          btnLabel.textContent = 'Not enough listed!';
        }

        setTimeout(() => {
          order.element.classList.remove('vibrate', 'fulfillment-error');
          if (btnLabel && order.element.parentElement) {
            btnLabel.textContent = 'Pack Order';
          }
        }, 600);
      }
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
        <span>Predicted ${order.qty}</span>
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
    DOM.forecastSummary.textContent = `Predicted ${total}`;
    updateForecastUI();
    return total;
  }

  function clearTutorialFocus() {
    $$('.tutorial-focus-shell').forEach((node) => node.classList.remove('tutorial-focus-shell'));
    $$('.tutorial-focus-target').forEach((node) => node.classList.remove('tutorial-focus-target'));
  }

  function clearGuideFocus() {
    $$('.tutorial-focus-shell').forEach((node) => node.classList.remove('tutorial-focus-shell'));
    $$('.tutorial-focus-target').forEach((node) => node.classList.remove('tutorial-focus-target'));
    $$('.guide-visible-window').forEach((node) => node.classList.remove('guide-visible-window'));
    $$('.guide-blurred').forEach((node) => node.classList.remove('guide-blurred'));
    DOM.guideOverlay.classList.add('hidden');
    DOM.guideOverlay.setAttribute('aria-hidden', 'true');
    DOM.guideBubble.classList.remove('place-top', 'place-bottom', 'place-left', 'place-right');
    DOM.guideBubble.style.top = '';
    DOM.guideBubble.style.left = '';
  }

  function applyGuideVisibleWindows(step) {
    const visibleSelectors = step.visibleWindows || [];

    // Mark visible windows
    visibleSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => node.classList.add('guide-visible-window'));
    });

    // Blur elements that are NOT visible windows
    // Top-bar children: blur individually so stat-lost/stat-oversell can stay crisp
    document.querySelectorAll('#top-bar > .stat-item').forEach((el) => {
      if (!el.classList.contains('guide-visible-window') && !visibleSelectors.some((s) => el.matches(s))) {
        el.classList.add('guide-blurred');
      }
    });

    // Major game sections and other elements that should blur when not highlighted
    const blurrableSelectors = [
      '#warehouse-hub',
      '#platforms-area',
      '#alert-container',
      '#forecast-strip',
      '#tutorial-callout',
      '.sync-layer',
    ];
    blurrableSelectors.forEach((selector) => {
      const el = document.querySelector(selector);
      if (el && !visibleSelectors.includes(selector)) {
        el.classList.add('guide-blurred');
      }
    });
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
      <button class="btn-fulfill" disabled style="--timer-progress: 100%;">
        <span class="btn-fulfill-label">Pack Order</span>
      </button>
    `;
    queue.prepend(card);
  }

  function positionGuideBubble(target, avoidTarget = target, preferredPlacement = '') {
    requestAnimationFrame(() => {
      const anchorRect = target.getBoundingClientRect();
      const avoidRect = avoidTarget.getBoundingClientRect();
      const bubbleRect = DOM.guideBubble.getBoundingClientRect();
      const viewportPadding = 16;
      const gap = 24;
      const placements = [];

      if (preferredPlacement) {
        placements.push(preferredPlacement);
        if (preferredPlacement === 'bottom') {
          placements.push('top');
        } else if (preferredPlacement === 'top') {
          placements.push('bottom');
        } else if (preferredPlacement === 'right') {
          placements.push('left');
        } else if (preferredPlacement === 'left') {
          placements.push('right');
        }
      } else if (avoidRect.top > window.innerHeight * 0.52) {
        placements.push('top', 'bottom');
      } else {
        placements.push('bottom', 'top');
      }

      const uniquePlacements = [...new Set(placements)];

      function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
      }

      function getPosition(placement) {
        if (placement === 'top' || placement === 'bottom') {
          const top = placement === 'top'
            ? avoidRect.top - bubbleRect.height - gap
            : avoidRect.bottom + gap;
          const left = clamp(
            anchorRect.left + (anchorRect.width / 2) - (bubbleRect.width / 2),
            viewportPadding,
            window.innerWidth - bubbleRect.width - viewportPadding,
          );
          return { placement, top, left };
        }

        const left = placement === 'left'
          ? avoidRect.left - bubbleRect.width - gap
          : avoidRect.right + gap;
        const top = clamp(
          anchorRect.top + (anchorRect.height / 2) - (bubbleRect.height / 2),
          viewportPadding,
          window.innerHeight - bubbleRect.height - viewportPadding,
        );
        return { placement, top, left };
      }

      let position = uniquePlacements
        .map(getPosition)
        .find(({ top, left }) => (
          top >= viewportPadding
          && top + bubbleRect.height <= window.innerHeight - viewportPadding
          && left >= viewportPadding
          && left + bubbleRect.width <= window.innerWidth - viewportPadding
        ));

      if (!position) {
        const fallbackPlacement = uniquePlacements[0] || 'bottom';
        position = getPosition(fallbackPlacement);
        position.top = clamp(
          position.top,
          viewportPadding,
          window.innerHeight - bubbleRect.height - viewportPadding,
        );
        position.left = clamp(
          position.left,
          viewportPadding,
          window.innerWidth - bubbleRect.width - viewportPadding,
        );
      }

      DOM.guideBubble.style.top = `${position.top}px`;
      DOM.guideBubble.style.left = `${position.left}px`;
      DOM.guideBubble.classList.remove('place-top', 'place-bottom', 'place-left', 'place-right');
      DOM.guideBubble.classList.add(`place-${position.placement}`);
    });
  }

  function showGuideStep(step) {
    if (step.sampleOrder) {
      ensureGuideSampleOrder();
    } else {
      removeGuideSampleOrder();
    }

    clearGuideFocus();
    applyGuideVisibleWindows(step);

    const target = document.querySelector(step.target);
    const shell = document.querySelector(step.shell);
    const extraShells = (step.extraShells || [])
      .map((selector) => document.querySelector(selector))
      .filter(Boolean);
    const extraTargets = (step.extraTargets || [])
      .map((selector) => document.querySelector(selector))
      .filter(Boolean);
    const avoidTarget = step.avoid ? document.querySelector(step.avoid) : target;
    if (!target || !shell || !avoidTarget) {
      return;
    }

    shell.classList.add('tutorial-focus-shell');
    extraShells.forEach((node) => node.classList.add('tutorial-focus-shell'));
    target.classList.add('tutorial-focus-target');
    extraTargets.forEach((node) => node.classList.add('tutorial-focus-target'));
    state.guideActive = true;
    state.guideStepIndex = step.index;
    DOM.guideStep.textContent = step.title;
    DOM.guideCopy.textContent = step.copy;
    DOM.guideProgress.textContent = `${step.index + 1} / ${state.guideSteps.length}`;
    DOM.guideNext.textContent = step.index === state.guideSteps.length - 1 ? 'Done' : 'Next';
    DOM.guideOverlay.classList.remove('hidden');
    DOM.guideOverlay.setAttribute('aria-hidden', 'false');
    positionGuideBubble(target, avoidTarget, step.placement);
  }

  function finishOnboarding() {
    state.onboardingRunning = false;
    state.onboardingTimers.forEach((timer) => clearTimeout(timer));
    state.onboardingTimers = [];
    state.guideActive = false;
    state.guideMode = '';
    state.guideSteps = [];
    state.guideStepIndex = 0;
    clearGuideFocus();
    removeGuideSampleOrder();

    if (state.pauseReason === 'guide') {
      state.paused = false;
      state.pauseReason = '';
    }

    updateUI();
  }

  function startOnboarding() {
    state.onboardingRunning = true;
    state.paused = true;
    state.pauseReason = 'guide';
    state.guideMode = 'onboarding';

    const steps = [
      {
        title: 'Store Stock',
        copy: 'Stocks listed in each store.',
        target: '#panel-shopee',
        shell: '#panel-shopee',
        extraShells: ['#panel-lazada', '#panel-tiktok'],
        extraTargets: ['#panel-lazada', '#panel-tiktok'],
        avoid: '#platforms-area',
        placement: 'top',
        visibleWindows: ['#platforms-area'],
      },
      {
        title: 'Warehouse Stock',
        copy: 'Your real stock on hand.',
        target: '#warehouse-hub',
        shell: '#warehouse-hub',
        visibleWindows: ['#warehouse-hub'],
      },
      {
        title: 'Missed Sales + Oversells',
        copy: 'These track missed demand and bad stock promises.',
        target: '.stat-lost',
        shell: '.stat-lost',
        extraTargets: ['.stat-oversell'],
        visibleWindows: ['.stat-lost', '.stat-oversell'],
        placement: 'bottom',
      },
    ];
    state.guideSteps = steps;
    state.guideStepIndex = 0;
    showGuideStep({ ...steps[0], index: 0 });
    updateUI();
  }

  function finishEdgeLabGuide() {
    state.tutorialRunning = false;
    state.guideActive = false;
    state.guideMode = '';
    state.guideSteps = [];
    state.guideStepIndex = 0;
    clearGuideFocus();

    if (state.pauseReason === 'guide') {
      state.paused = false;
      state.pauseReason = '';
    }

    state.nextWaveAt = Date.now() + 900;
    updateUI();
  }

  function advanceGuideStep() {
    if (!state.guideActive) {
      return;
    }

    const nextIndex = state.guideStepIndex + 1;
    if (nextIndex >= state.guideSteps.length) {
      if (state.guideMode === 'edgelab') {
        finishEdgeLabGuide();
      } else {
        finishOnboarding();
      }
      return;
    }

    showGuideStep({ ...state.guideSteps[nextIndex], index: nextIndex });
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

  function showTutorialStep(step, index) {
    clearTutorialFocus();

    const shell = step.shell ? document.querySelector(step.shell) : null;
    const target = step.target ? document.querySelector(step.target) : null;

    if (shell) {
      shell.classList.add('tutorial-focus-shell');
    }
    if (target) {
      target.classList.add('tutorial-focus-target');
    }

    state.tutorialStepIndex = index;
    DOM.tutorialStep.textContent = step.title;
    DOM.tutorialCopy.textContent = step.copy;
    DOM.tutorialProgress.textContent = `${index + 1} / ${state.tutorialSteps.length}`;
    DOM.tutorialNext.textContent = index === state.tutorialSteps.length - 1 ? 'Done' : 'Next';
    DOM.tutorialCallout.classList.remove('hidden');
  }

  function hideTutorial() {
    clearTutorialFocus();
    DOM.tutorialCallout.classList.add('hidden');
  }

  function finishTutorial() {
    state.tutorialRunning = false;
    state.tutorialStepIndex = 0;
    state.tutorialSteps = [];
    hideTutorial();
    updateUI();
  }

  function advanceTutorial() {
    if (!state.tutorialRunning) {
      return;
    }

    const nextIndex = state.tutorialStepIndex + 1;
    if (nextIndex >= state.tutorialSteps.length) {
      finishTutorial();
      return;
    }

    showTutorialStep(state.tutorialSteps[nextIndex], nextIndex);
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

    state.comparisonBaseline = {
      missedSales: state.missedSales,
      oversellCount: state.oversellCount,
    };
    state.missedSales = 0;
    state.oversellCount = 0;
    DOM.lostDelta.classList.add('hidden');
    DOM.oversellDelta.classList.add('hidden');
    state.edgelabActive = true;
    state.tutorialRunning = true;
    state.paused = true;
    state.pauseReason = 'guide';
    state.modalShown = true;
    state.guideMode = 'edgelab';
    const edgelabVisible = ['#forecast-strip', '#platforms-area', '#warehouse-hub', '.stat-lost', '.stat-oversell'];
    state.guideSteps = [
      {
        title: 'Forecasts',
        copy: 'Forecasting predicts sales demand for each store.',
        shell: '#forecast-strip',
        target: '#forecast-strip .forecast-lanes',
        avoid: '#forecast-strip',
        placement: 'bottom',
        visibleWindows: edgelabVisible,
      },
      {
        title: 'Ordered',
        copy: 'Total stock ordered according to forecast.',
        shell: '#forecast-strip',
        target: '#forecast-strip .forecast-auto',
        avoid: '#forecast-strip',
        placement: 'bottom',
        visibleWindows: edgelabVisible,
      },
    ];
    state.guideStepIndex = 0;

    DOM.modal.classList.add('hidden');
    hideTutorial();
    clearManualOrders();
    buildForecast();
    syncPlatformsToWarehouse();
    autoRestockFromForecast();
    updateUI();
    showGuideStep({ ...state.guideSteps[0], index: 0 });
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

      if (!state.edgelabActive && !state.modalShown && elapsed >= cfg.modalTriggerAt) {
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
    state.tutorialStepIndex = 0;
    state.tutorialSteps = [];
    state.guideMode = '';
    state.forecast = { shopee: 0, lazada: 0, tiktok: 0 };
    state.oversellCount = 0;
    state.lastAutoOrderedQty = 0;
    state.comparisonBaseline = { missedSales: 0, oversellCount: 0 };
    state.nextWaveAt = Date.now() + 1200;

    document.body.classList.remove('edgelab-active');
    DOM.modal.classList.add('hidden');
    hideTutorial();
    clearGuideFocus();
    removeGuideSampleOrder();
    DOM.alertContainer.innerHTML = '';
    DOM.lostDelta.classList.add('hidden');
    DOM.oversellDelta.classList.add('hidden');
    clearSyncMap();

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
    clearSyncMap();

    $('#end-icon').textContent = state.edgelabActive ? '📈' : '📊';
    $('#end-title').textContent = state.edgelabActive ? 'EdgeLab Wins' : "Time's Up";
    $('#end-subtitle').textContent = state.edgelabActive ? '' : 'Ops recap.';
    $('#end-subtitle').classList.toggle('hidden', state.edgelabActive);
    const manualLost = state.edgelabActive ? state.comparisonBaseline.missedSales : state.missedSales;
    const manualOversells = state.edgelabActive ? state.comparisonBaseline.oversellCount : state.oversellCount;
    $('#compare-before-lost').textContent = String(manualLost);
    $('#compare-before-oversells').textContent = String(manualOversells);
    $('#compare-after-lost').textContent = '0';
    $('#compare-after-oversells').textContent = '0';

    let message = 'Manual stock drifted out of control.';
    if (state.edgelabActive) {
      message = '';
    } else if (state.oversellCount >= state.missedSales) {
      message = 'Oversells hit before the channels could react.';
    } else if (state.missedSales > 0) {
      message = 'Demand arrived faster than the listings could keep up.';
    }

    $('#end-message').textContent = message;
    $('#end-message').classList.toggle('hidden', state.edgelabActive);
    showScreen('end-screen');
  }

  function initEventListeners() {
    DOM.btnStart.addEventListener('click', startGame);
    DOM.btnRestart.addEventListener('click', () => showScreen('start-screen'));
    DOM.btnReorder.addEventListener('click', reorderStock);
    DOM.btnActivateEdgeLab.addEventListener('click', activateEdgeLab);
    DOM.tutorialNext.addEventListener('click', advanceTutorial);

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
      advanceGuideStep();
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

    window.addEventListener('resize', renderSyncMap);
  }

  initEventListeners();
  updateUI();
  refreshQueuePlaceholders();
})();
