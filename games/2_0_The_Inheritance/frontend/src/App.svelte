<script lang="ts">
  import { onMount } from 'svelte';
  import BonusFeatureMenu from './components/BonusFeatureMenu.svelte';
  import AutoplayConfirm from './components/AutoplayConfirm.svelte';
  import Controls from './components/Controls.svelte';
  import ReelBoard from './components/ReelBoard.svelte';
  import ReplayBanner from './components/ReplayBanner.svelte';
  import RoundOverlay from './components/RoundOverlay.svelte';
  import RulesModal from './components/RulesModal.svelte';
  import {
    DEFAULT_BALANCE,
    DEFAULT_BET_AMOUNT,
    DEFAULT_BET_LEVELS,
    GAME_SUBTITLE,
    GAME_TITLE,
    type GameModeId,
  } from './lib/constants';
  import { createDemoBook, type SpinBook } from './lib/books';
  import { assetUrl } from './lib/assets';
  import { amountToDisplay, socialText } from './lib/format';
  import { getMode } from './lib/mathProfile';
  import {
    buildPresentation,
    type PresentationFrame,
    type PresentationSequence,
    type ReelMotionPhase,
  } from './lib/presentation';
  import { getReplayConfig, loadReplay } from './lib/replay';
  import { createRuntime, getLaunchConfig, playRound, settleRound, type Balance } from './lib/rgs';
  import {
    duckMusic,
    playSound,
    preloadAudio,
    setMusicMood,
    setMuted,
    startMusic,
    type MusicMood,
  } from './lib/sound';

  let selectedMode: GameModeId = 'BASE';
  let currentBook: SpinBook = createDemoBook('BASE', 'blackthorn-opening');
  let currentSequence: PresentationSequence = buildPresentation(currentBook);
  let currentFrame: PresentationFrame = currentSequence.frames[0];
  let motion: ReelMotionPhase = 'idle';
  let stoppingReel = 4;
  let anticipating = false;
  let chapterTitle: string | null = null;
  let overlayMode: 'intro' | 'summary' | null = null;
  let balance: Balance = { amount: DEFAULT_BALANCE, currency: 'USD' };
  let pendingBalance: Balance | null = null;
  let betLevels = DEFAULT_BET_LEVELS;
  let betAmount = DEFAULT_BET_AMOUNT;
  let activeRoundBet = betAmount;
  let client: Awaited<ReturnType<typeof createRuntime>>['client'] = null;
  let loading = true;
  let spinning = false;
  let muted = false;
  let rulesOpen = false;
  let featureMenuOpen = false;
  let uiMessage: string | null = null;
  let replayMessage: string | null = null;
  let replayMode = false;
  let replayReady = false;
  let replayCompleted = false;
  let replayCostMultiplier = 1;
  let replayPayoutMultiplier = 0;
  let localMathRound = false;
  let social = false;
  let runtimeBlocked = false;
  let spacebarEnabled = true;
  let buyFeaturesEnabled = true;
  let autoplayEnabled = true;
  let autoplayActive = false;
  let autoplayRemaining = 0;
  let autoplayConfirmOpen = false;
  let anteConfirmOpen = false;
  let displayRTP = true;
  let minimumRoundDuration = 0;
  let roundStartedAt = 0;
  let roundNeedsEnd = false;
  let winShown = 0;
  let spinTimer: ReturnType<typeof setInterval> | null = null;
  let runToken = 0;
  let autoplayTimer: number | null = null;

  $: modeConfig = getMode(selectedMode);
  $: totalCost = betAmount * modeConfig.costMultiplier;
  $: canAfford = balance.amount >= totalCost;
  $: featureActive = ['will', 'vault', 'seance', 'codicil'].includes(currentFrame.phase);
  $: displayedWinMultiplier = activeRoundBet > 0 ? winShown / activeRoundBet : 0;
  $: machineStatus = motion === 'spinning'
    ? 'REELS IN MOTION'
      : motion === 'landed'
        ? 'SEAL DETECTED'
        : motion === 'locking'
          ? 'HEIRLOOM LOCKED'
      : motion === 'expanding'
        ? 'WILD REEL EXPANDING'
        : currentFrame.mechanicLabel;
  $: summaryWinAmount = Math.round(activeRoundBet * currentSequence.totalPayoutMultiplier);

  onMount(() => {
    preloadAudio();
    const launch = getLaunchConfig();
    const replay = getReplayConfig();
    social = launch.social;
    replayMode = replay.active;

    const keyHandler = (event: KeyboardEvent) => {
      if (event.code === 'Space' && spacebarEnabled && !event.repeat && !rulesOpen && !featureMenuOpen && !autoplayConfirmOpen && !anteConfirmOpen) {
        event.preventDefault();
        if (overlayMode) {
          continueOverlay();
        } else if (!replayMode) {
          void startRound(selectedMode);
        }
      }
      if (event.code === 'Escape') {
        rulesOpen = false;
        featureMenuOpen = false;
        autoplayConfirmOpen = false;
        anteConfirmOpen = false;
      }
    };
    const unlockAudio = () => startMusic(muted, featureMood(currentSequence.feature));

    window.addEventListener('keydown', keyHandler);
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    void boot(replay);

    return () => {
      runToken += 1;
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      if (spinTimer) clearInterval(spinTimer);
      if (autoplayTimer) clearTimeout(autoplayTimer);
    };
  });

  async function boot(replay: ReturnType<typeof getReplayConfig>) {
    loading = true;
    if (replay.active) {
      selectedMode = replay.mode;
      betAmount = replay.amount;
      activeRoundBet = replay.amount;
      balance = { amount: replay.amount, currency: replay.currency };
      const result = await loadReplay(replay);
      replayReady = result.ok;
      if (result.ok) {
        currentBook = result.book;
        currentSequence = buildPresentation(currentBook);
        currentFrame = currentSequence.frames[currentSequence.frames.length - 1];
        replayCostMultiplier = result.costMultiplier;
        replayPayoutMultiplier = result.payoutMultiplier;
        replayMessage = null;
        winShown = Math.round(replay.amount * result.payoutMultiplier);
      } else {
        replayMessage = result.message;
      }
      loading = false;
      return;
    }

    const runtime = await createRuntime();
    client = runtime.client;
    balance = runtime.state.balance;
    betLevels = runtime.state.betLevels;
    betAmount = runtime.state.defaultBetLevel;
    activeRoundBet = betAmount;
    social = social || runtime.state.socialCasino;
    runtimeBlocked = !runtime.state.playable;
    spacebarEnabled = runtime.state.spacebarEnabled;
    buyFeaturesEnabled = runtime.state.buyFeaturesEnabled;
    autoplayEnabled = runtime.state.autoplayEnabled;
    displayRTP = runtime.state.displayRTP;
    minimumRoundDuration = runtime.state.minimumRoundDuration;
    uiMessage = runtime.state.error;
    loading = false;

    if (runtime.state.activeRound) {
      const restored = runtime.state.activeRound;
      selectedMode = restored.mode;
      betAmount = restored.amount;
      activeRoundBet = restored.amount;
      currentBook = restored.book;
      currentSequence = buildPresentation(restored.book);
      currentFrame = currentSequence.frames[0];
      roundNeedsEnd = restored.needsEndRound;
      spinning = true;
      uiMessage = 'Restored unfinished round from the game server.';
      if (isBonusFeature(currentSequence.feature)) {
        overlayMode = 'intro';
      } else {
        void runSequence();
      }
    }
  }

  async function startRound(mode: GameModeId, automated = false) {
    if (spinning || replayMode || overlayMode || runtimeBlocked) return;
    if (automated && !autoplayActive) return;
    const roundMode = getMode(mode);
    const roundCost = betAmount * roundMode.costMultiplier;
    if (balance.amount < roundCost) {
      stopAutoplay();
      uiMessage = 'Balance is below this round cost. Choose a lower bet or feature.';
      return;
    }

    const startingBalance = balance;
    activeRoundBet = betAmount;
    spinning = true;
    roundStartedAt = performance.now();
    winShown = 0;
    uiMessage = null;
    featureMenuOpen = false;
    startMusic(muted);
    playSound('spin', muted);
    balance = { ...balance, amount: Math.max(0, balance.amount - roundCost) };

    const result = await playRound(mode, betAmount, client);
    if (!result.ok) {
      balance = startingBalance;
      spinning = false;
      motion = 'idle';
      runtimeBlocked = Boolean(client);
      stopAutoplay();
      uiMessage = socialText(
        `${result.error}${client ? ' Reload the game before trying another play.' : ''}`,
        social,
      );
      return;
    }

    localMathRound = Boolean(result.localPreview);
    roundNeedsEnd = result.needsEndRound;
    currentBook = result.book;
    currentSequence = buildPresentation(result.book);
    currentFrame = currentSequence.frames[0];
    setMusicMood(featureMood(currentSequence.feature), muted);
    pendingBalance = result.balance ?? {
      ...startingBalance,
      amount: Math.max(0, startingBalance.amount - roundCost) + Math.round(betAmount * result.book.payoutMultiplier),
    };
    if (isBonusFeature(currentSequence.feature)) {
      stopAutoplay();
      playFeatureIntroSound(currentSequence.feature);
      motion = 'idle';
      overlayMode = 'intro';
    } else {
      await runSequence();
    }
  }

  async function runSequence() {
    const token = ++runToken;
    overlayMode = null;
    let previousPhase = currentSequence.frames[0]?.phase;
    let previousMultiplier = 1;

    if (currentSequence.feature === 'codicil' && previousPhase) {
      setMusicMood(featureMood(previousPhase), muted);
      chapterTitle = currentSequence.frames[0].stageLabel;
      playSound('chapter', muted);
      await wait(520);
      if (token !== runToken) return;
      chapterTitle = null;
    }

    for (let frameIndex = 0; frameIndex < currentSequence.frames.length; frameIndex += 1) {
      const frame = currentSequence.frames[frameIndex];
      if (token !== runToken) return;
      currentFrame = frame;

      if (frame.mechanicLabel.includes('RETRIGGERED')) {
        playSound('retrigger', muted);
        chapterTitle = frame.mechanicLabel;
        await wait(600);
        if (token !== runToken) return;
        chapterTitle = null;
      }

      if (frameIndex > 0 && frame.phase !== previousPhase) {
        setMusicMood(featureMood(frame.phase), muted);
        chapterTitle = frame.stageLabel;
        playSound('chapter', muted);
        playFeatureIntroSound(frame.phase);
        await wait(700);
        if (token !== runToken) return;
        chapterTitle = null;
      }
      previousPhase = frame.phase;

      stoppingReel = -1;
      anticipating = false;
      motion = 'spinning';
      playSound('spin', muted);
      await wait(160);

      for (let reel = 0; reel < 5; reel += 1) {
        if (token !== runToken) return;
        if (frame.expandingWild && frame.expandingWild.reel === reel && reel >= 3) {
          anticipating = true;
          playSound('tease', muted, 0.82);
          await wait(110);
        }
        stoppingReel = reel;
        playSound('reelStop', muted, 0.88 + reel * 0.025);
        await wait(58 + (anticipating ? 22 : 0));
      }

      if (token !== runToken) return;
      motion = 'landed';
      anticipating = false;
      await wait(frame.expandingWild ? 125 : 78);

      if (frame.phase === 'vault' && frame.winPositions.length > 0) {
        motion = 'locking';
        const lockCount = Math.min(4, frame.winPositions.length);
        for (let lockIndex = 0; lockIndex < lockCount; lockIndex += 1) {
          playSound('lock', muted, 0.85 + lockIndex * 0.04);
          await wait(54);
        }
        await wait(100);
      }

      if (frame.expandingWild) {
        motion = 'expanding';
        duckMusic(0.42, 720);
        playSound(frame.expandingWild.kind === 'spirit' ? 'seance' : 'wild', muted);
        await wait(520);
      }

      if (token !== runToken) return;
      motion = 'win';
      const targetWin = Math.round(activeRoundBet * frame.cumulativeWinMultiplier);
      animateWin(targetWin);
      if (frame.multiplier > previousMultiplier && frameIndex > 0) {
        playSound('multiplier', muted, Math.min(1.2, 0.8 + frame.multiplier / 80));
      }
      previousMultiplier = frame.multiplier;
      playFrameWinAudio(frame);
      await wait(winHoldDuration(frame));
    }

    if (token !== runToken) return;
    const elapsed = performance.now() - roundStartedAt;
    if (minimumRoundDuration > elapsed) {
      await wait(minimumRoundDuration - elapsed);
      if (token !== runToken) return;
    }
    motion = 'idle';
    winShown = Math.round(activeRoundBet * currentSequence.totalPayoutMultiplier);
    if (roundNeedsEnd && client) {
      const settlement = await settleRound(client);
      if (!settlement.ok) {
        runtimeBlocked = true;
        uiMessage = socialText(
          `${settlement.error} Reload the game to finish this uncompleted round.`,
          social,
        );
      } else {
        pendingBalance = settlement.balance ?? pendingBalance;
        roundNeedsEnd = false;
      }
    }
    if (pendingBalance) balance = pendingBalance;
    pendingBalance = null;
    spinning = false;
    playOutcomeAudio(currentBook);

    if (isBonusFeature(currentSequence.feature)) {
      overlayMode = 'summary';
    }
    if (replayMode) replayCompleted = true;
    if (autoplayActive && !isBonusFeature(currentSequence.feature)) {
      autoplayRemaining = Math.max(0, autoplayRemaining - 1);
      const nextCost = betAmount * getMode(selectedMode).costMultiplier;
      if (autoplayRemaining <= 0 || balance.amount < nextCost || runtimeBlocked) {
        stopAutoplay();
      } else {
        autoplayTimer = window.setTimeout(() => {
          autoplayTimer = null;
          void startRound(selectedMode, true);
        }, 360);
      }
    }
  }

  function continueOverlay() {
    if (overlayMode === 'intro') {
      void runSequence();
      return;
    }
    if (overlayMode === 'summary') {
      overlayMode = null;
      setMusicMood('base', muted);
      currentBook = createDemoBook(selectedMode, `return-to-base-${Date.now()}`);
      currentSequence = buildPresentation(currentBook);
      currentFrame = currentSequence.frames[0];
      motion = 'idle';
      winShown = 0;
      localMathRound = false;
    }
  }

  function playFeatureIntroSound(feature: PresentationSequence['feature']) {
    duckMusic(0.34, 1_050);
    if (feature === 'vault') playSound('vault', muted);
    else if (feature === 'seance') playSound('seance', muted);
    else if (feature === 'codicil') playSound('codicil', muted);
    else playSound('will', muted);
  }

  function playOutcomeAudio(book: SpinBook) {
    if (book.outcome.kind === 'max') playSound('max', muted);
    else if (book.payoutMultiplier >= 1 && !isBonusFeature(book.outcome.feature)) playSound('win', muted);
  }

  function playFrameWinAudio(frame: PresentationFrame) {
    const win = frame.spinWinMultiplier;
    if (win <= 0) return;
    if (frame.winBreakdown?.kind === 'collection') {
      playSound('collect', muted, Math.min(1.25, 0.82 + win / 1_000));
      if (win >= 100) playSound('winMid', muted, 0.78);
      return;
    }
    if (win >= 250) {
      duckMusic(0.28, 1_300);
      playSound('bigWin', muted, Math.min(1.25, 0.9 + win / 5_000));
    } else if (win >= 40) {
      playSound('winHigh', muted, 0.92);
    } else if (win >= 8) {
      playSound('winMid', muted, 0.9);
    } else {
      playSound('winLow', muted, 0.88);
    }
  }

  function winHoldDuration(frame: PresentationFrame): number {
    const win = frame.spinWinMultiplier;
    if (win <= 0) return 280;
    if (win >= 250) return 1_420;
    if (win >= 40) return 1_020;
    if (win >= 8) return 820;
    return 620;
  }

  function animateWin(target: number) {
    if (spinTimer) clearInterval(spinTimer);
    const start = winShown;
    if (target <= start) {
      winShown = target;
      return;
    }
    const frames = 18;
    let frame = 0;
    spinTimer = setInterval(() => {
      frame += 1;
      const eased = 1 - Math.pow(1 - frame / frames, 3);
      winShown = Math.round(start + (target - start) * eased);
      if (frame >= frames && spinTimer) {
        clearInterval(spinTimer);
        spinTimer = null;
      }
    }, 24);
  }

  function playReplay() {
    if (spinning || !replayReady) return;
    replayCompleted = false;
    spinning = true;
    currentSequence = buildPresentation(currentBook);
    currentFrame = currentSequence.frames[0];
    winShown = 0;
    startMusic(muted);
    if (isBonusFeature(currentSequence.feature)) {
      playFeatureIntroSound(currentSequence.feature);
      overlayMode = 'intro';
    } else {
      void runSequence();
    }
  }

  function changeBet(value: number) {
    stopAutoplay();
    betAmount = value;
    playSound('button', muted);
  }

  function toggleAnte() {
    stopAutoplay();
    if (selectedMode === 'HEIRLOOM_ANTE') {
      selectedMode = 'BASE';
    } else {
      anteConfirmOpen = true;
    }
    playSound('button', muted);
  }

  function confirmAnte() {
    anteConfirmOpen = false;
    selectedMode = 'HEIRLOOM_ANTE';
    playSound('button', muted);
  }

  function openAutoplay() {
    if (autoplayActive) {
      stopAutoplay();
      return;
    }
    if (!autoplayEnabled || spinning || overlayMode || runtimeBlocked) return;
    autoplayConfirmOpen = true;
    playSound('button', muted);
  }

  function beginAutoplay(rounds: number) {
    autoplayConfirmOpen = false;
    autoplayRemaining = rounds;
    autoplayActive = true;
    void startRound(selectedMode, true);
  }

  function stopAutoplay() {
    autoplayActive = false;
    autoplayRemaining = 0;
    if (autoplayTimer) {
      clearTimeout(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function maxBet() {
    stopAutoplay();
    betAmount = betLevels[betLevels.length - 1] ?? betAmount;
    playSound('button', muted);
  }

  function openFeatureMenu() {
    if (spinning || overlayMode || !buyFeaturesEnabled) return;
    stopAutoplay();
    featureMenuOpen = true;
    startMusic(muted);
    playSound('button', muted);
  }

  function toggleMute() {
    muted = !muted;
    setMuted(muted);
    if (!muted) startMusic(false, featureMood(currentSequence.feature));
  }

  function isBonusFeature(feature: PresentationSequence['feature']): boolean {
    return feature === 'will' || feature === 'vault' || feature === 'seance' || feature === 'codicil';
  }

  function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function featureMood(feature: PresentationSequence['feature']): MusicMood {
    if (feature === 'will' || feature === 'vault' || feature === 'seance' || feature === 'codicil') return feature;
    return 'base';
  }

  function chapterTransitionArt(feature: PresentationSequence['feature']): string {
    const chapter = feature === 'will' || feature === 'vault' || feature === 'seance'
      ? feature
      : 'codicil';
    return assetUrl(`transitions/chapter-${chapter}.webp`);
  }
</script>

<main
  class:replay-mode={replayMode}
  class:feature-active={featureActive}
  class:seance-atmosphere={currentFrame.phase === 'seance'}
  class:vault-atmosphere={currentFrame.phase === 'vault'}
  class="game-root"
>
  <div class="paper-grain"></div>
  <div class="rain-light"></div>
  <ReplayBanner
    replay={replayMode}
    loading={loading}
    message={replayMessage}
    book={replayReady ? currentBook : null}
    amount={activeRoundBet}
    currency={balance.currency}
    costMultiplier={replayCostMultiplier}
    payoutMultiplier={replayPayoutMultiplier}
    completed={replayCompleted}
    {social}
    onPlayReplay={playReplay}
  />

  <header class="game-header">
    <div class="title-lockup">
      <span class="estate-mark" aria-hidden="true">B</span>
      <div>
        <span class="eyebrow">{GAME_SUBTITLE}</span>
        <h1>{GAME_TITLE}</h1>
        <p>A family mystery told across five reels</p>
      </div>
    </div>
    <div class="game-metrics">
      <span><small>WAYS</small><strong>1,024</strong></span>
      {#if displayRTP}<span><small>RTP</small><strong>{modeConfig.rtpLabel}</strong></span>{/if}
      <span><small>MAX WIN</small><strong>{modeConfig.maxWinMultiplier.toLocaleString('en')}×</strong></span>
    </div>
  </header>

  <section class="machine-shell">
    <div class="machine-ornament machine-ornament-left">
      <img src={assetUrl('symbols/heiress.webp')} alt="Evelyn Blackthorn, the heiress" />
      <span><small>THE HEIRESS</small><strong>Evelyn</strong></span>
    </div>
    <div class="reel-backplate">
      <ReelBoard book={currentBook} frame={currentFrame} {motion} {stoppingReel} {anticipating} />
    </div>
    {#if chapterTitle}
      <div class="chapter-transition" role="status">
        <img src={chapterTransitionArt(currentFrame.phase)} alt="" />
        <div class="chapter-transition-shade"></div>
        <small>{chapterTitle.includes('FREE SPINS') ? 'BONUS EXTENDED' : 'THE FINAL CODICIL CONTINUES'}</small>
        <strong>{chapterTitle}</strong>
        <span></span>
      </div>
    {/if}
    <div class="machine-ornament machine-ornament-right">
      <img src={assetUrl('symbols/executor.webp')} alt="Mr Vale, the executor" />
      <span><small>THE EXECUTOR</small><strong>Mr Vale</strong></span>
    </div>
  </section>

  <section class="win-panel" aria-live="polite">
    <div class="status-message">
      <small>{currentFrame.stageLabel}</small>
      <strong>{machineStatus}</strong>
      <span>
        {localMathRound
          ? 'LOCAL WEIGHTED MATH · drawn from the same 1,000,000-weight publication table'
          : motion === 'idle'
            ? 'Press the seal to spin'
            : currentFrame.phase === 'vault'
              ? 'New values stay locked'
              : 'Every reel settles in order'}
      </span>
    </div>
    <div class="win-readout">
      <small>{socialText('Win', social)}</small>
      <strong>{amountToDisplay(winShown, balance.currency, 'result')}</strong>
      {#if displayedWinMultiplier > 0}
        <span>{displayedWinMultiplier.toLocaleString('en', { maximumFractionDigits: 2 })}× {social ? 'PLAY' : 'BET'}</span>
      {/if}
    </div>
  </section>

  {#if uiMessage}
    <p class="runtime-message">{socialText(uiMessage, social)}</p>
  {:else if !canAfford}
    <p class="runtime-message">
      {socialText('Balance is below the selected round cost. Choose a lower bet or disable the ante.', social)}
    </p>
  {/if}

  <BonusFeatureMenu
    {betAmount}
    balanceAmount={balance.amount}
    currency={balance.currency}
    open={featureMenuOpen}
    disabled={loading || spinning || replayMode || runtimeBlocked || !buyFeaturesEnabled}
    {social}
    showRtp={displayRTP}
    onClose={() => (featureMenuOpen = false)}
    onBuy={(mode) => void startRound(mode)}
  />

  {#if !replayMode}
    <Controls
      balanceAmount={balance.amount}
      currency={balance.currency}
      {betAmount}
      {betLevels}
      {selectedMode}
      disabled={loading || spinning || runtimeBlocked || !canAfford || Boolean(overlayMode)}
      featureDisabled={!buyFeaturesEnabled}
      {muted}
      {social}
      {autoplayEnabled}
      {autoplayActive}
      {autoplayRemaining}
      onSpin={() => void startRound(selectedMode)}
      onBetChange={changeBet}
      onToggleMute={toggleMute}
      onShowRules={() => { stopAutoplay(); rulesOpen = true; }}
      onShowFeatures={openFeatureMenu}
      onMaxBet={maxBet}
      onToggleAnte={toggleAnte}
      onToggleAutoplay={openAutoplay}
    />
  {/if}

  <footer class="game-footer">Independent rounds · No feature guarantees a win · 18+</footer>

  {#if overlayMode}
    <RoundOverlay
      mode={overlayMode}
      sequence={currentSequence}
      winAmount={summaryWinAmount}
      roundCostAmount={activeRoundBet * currentBook.costMultiplier}
      currency={balance.currency}
      {social}
      onContinue={continueOverlay}
    />
  {/if}
</main>

<AutoplayConfirm
  open={autoplayConfirmOpen}
  {social}
  onCancel={() => (autoplayConfirmOpen = false)}
  onConfirm={beginAutoplay}
/>

{#if anteConfirmOpen}
  <div class="modal-backdrop confirm-layer" role="presentation">
    <button class="modal-close-layer" type="button" aria-label="Cancel Heirloom Ante" on:click={() => (anteConfirmOpen = false)}></button>
    <div class="feature-confirm autoplay-confirm" role="dialog" aria-modal="true" aria-label="Confirm Heirloom Ante">
      <div class="confirm-copy">
        <span class="eyebrow">Higher-cost mode</span>
        <span class="confirm-type">HEIRLOOM ANTE · 3×</span>
        <h2>Activate Heirloom Ante?</h2>
        <p>
          This mode charges three times the selected base {social ? 'play amount' : 'bet'} and uses a separate
          weighted table with a 6.61% natural-feature frequency. A return is not guaranteed.
        </p>
        <div class="confirm-actions">
          <button type="button" class="text-button" on:click={() => (anteConfirmOpen = false)}>Cancel</button>
          <button type="button" class="feature-confirm-button" on:click={confirmAnte}>Activate · 3×</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<RulesModal open={rulesOpen} {social} showRtp={displayRTP} onClose={() => (rulesOpen = false)} />
