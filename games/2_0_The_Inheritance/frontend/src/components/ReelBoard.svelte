<script lang="ts">
  import { assetUrl } from '../lib/assets';
  import SymbolTile from './SymbolTile.svelte';
  import type { Position, SpinBook } from '../lib/books';
  import type { PresentationFrame, ReelMotionPhase } from '../lib/presentation';
  import { SYMBOL_BY_KEY } from '../lib/symbols';

  export let book: SpinBook;
  export let frame: PresentationFrame;
  export let motion: ReelMotionPhase = 'idle';
  export let stoppingReel = 4;
  export let anticipating = false;

  function isMarked(reel: number, row: number, positions: Position[]): boolean {
    return positions.some((position) => position.reel === reel && position.row === row);
  }

  function motionSymbols(reel: typeof frame.board[number], reelIndex: number) {
    const offset = (frame.spinNumber + reelIndex) % reel.length;
    const shifted = [...reel.slice(offset), ...reel.slice(0, offset)];
    return [...shifted, ...shifted, ...shifted];
  }

  function representativePath(positions: Position[]): Position[] {
    const grouped = new Map<number, Position[]>();
    for (const position of positions) {
      const group = grouped.get(position.reel) ?? [];
      group.push(position);
      grouped.set(position.reel, group);
    }
    const result: Position[] = [];
    for (let reel = 0; reel < 5; reel += 1) {
      const group = grouped.get(reel);
      if (!group?.length) break;
      result.push(group[Math.floor((group.length - 1) / 2)]);
    }
    return result;
  }

  $: isFeature = frame.phase === 'will' || frame.phase === 'vault' || frame.phase === 'seance' || frame.phase === 'codicil';
  $: isVault = frame.phase === 'vault';
  $: activeWildReels = new Set(frame.activeWildReels);
  $: isBigWin = motion === 'win' && frame.spinWinMultiplier >= 20;
  $: dimUnmatched = motion === 'win' && frame.spinWinMultiplier > 0;
  $: progress = Array.from({ length: Math.min(frame.spinsTotal, 20) });
  $: pathPositions = frame.winBreakdown?.kind === 'ways' ? representativePath(frame.winPositions) : [];
  $: pathPoints = pathPositions
    .map((position) => `${(position.reel + 0.5) * 20},${(position.row + 0.5) * 25}`)
    .join(' ');
  $: breakdownSymbol = frame.winBreakdown ? SYMBOL_BY_KEY[frame.winBreakdown.icon] : null;
</script>

<section
  class:feature-round={isFeature}
  class:vault-round={isVault}
  class:seance-round={frame.phase === 'seance'}
  class:max-win={book.outcome.kind === 'max'}
  class:evaluating={motion === 'win'}
  class:anticipating
  class:big-win={isBigWin}
  class:portrait-win={breakdownSymbol?.tier === 'premium'}
  class:heirloom-win={breakdownSymbol?.tier === 'high' || breakdownSymbol?.tier === 'low'}
  class:collection-win={frame.winBreakdown?.kind === 'collection'}
  class:spirit-win={frame.expandingWild?.kind === 'spirit'}
  class="reel-stage"
  aria-label="The Inheritance five-reel slot"
>
  <div class:base-layout={!isFeature} class="feature-hud">
    {#if isFeature}
      <div class="feature-hud-block counter-block">
        <small>{frame.counterLabel}</small>
        <strong>{frame.counterValue}</strong>
      </div>
    {/if}

    <div class="feature-hud-title">
      <small>{frame.stageLabel}</small>
      <strong>{frame.mechanicLabel}</strong>
      <span class="feature-goal">{frame.featureGoal}</span>
      {#if frame.spinsTotal > 1}
        <div class="spin-progress" aria-hidden="true">
          {#each progress as _, index}
            <i class:complete={index < frame.spinNumber - 1} class:current={index === frame.spinNumber - 1}></i>
          {/each}
        </div>
      {/if}
    </div>

    <div class="feature-hud-block feature-multiplier">
      <small>{frame.phase === 'vault' ? 'LOCKED VALUES' : isFeature ? 'FEATURE POWER' : 'WAYS BEGIN'}</small>
      <strong>{frame.phase === 'vault' ? `${frame.lockedValues}/20` : isFeature ? `×${frame.multiplier}` : 'REEL 1'}</strong>
    </div>
  </div>

  <div class="reel-frame">
    <span class="cabinet-light cabinet-light-left" aria-hidden="true"></span>
    <span class="cabinet-light cabinet-light-right" aria-hidden="true"></span>

    {#each frame.board as reel, reelIndex}
      <div
        class:spinning={motion === 'spinning' && reelIndex > stoppingReel}
        class:settling={motion === 'spinning' && reelIndex === stoppingReel}
        class:wild-reel={activeWildReels.has(reelIndex)}
        class:spirit-reel={frame.expandingWild?.kind === 'spirit' && frame.expandingWild.reel === reelIndex}
        class:target-reel={anticipating && frame.expandingWild?.reel === reelIndex}
        class="reel"
        style={`--reel-index:${reelIndex};--origin-row:${frame.expandingWild?.originRow ?? 1}`}
      >
        {#if motion === 'spinning' && reelIndex > stoppingReel}
          <div class="reel-motion-strip" aria-hidden="true">
            {#each motionSymbols(reel, reelIndex) as movingSymbol}
              <img src={SYMBOL_BY_KEY[movingSymbol].image} alt="" />
            {/each}
          </div>
        {/if}
        <div class="reel-strip">
          {#each reel as symbol, rowIndex}
            <SymbolTile
              symbolKey={symbol}
              winning={motion === 'win' && isMarked(reelIndex, rowIndex, frame.winPositions)}
              spinning={motion === 'spinning' && reelIndex > stoppingReel}
              settling={motion === 'spinning' && reelIndex === stoppingReel}
              locking={motion === 'locking' && isMarked(reelIndex, rowIndex, frame.winPositions)}
              dimmed={dimUnmatched && !isMarked(reelIndex, rowIndex, frame.winPositions)}
              prizeValue={frame.prizeValues[`${reelIndex}:${rowIndex}`]}
              {reelIndex}
              {rowIndex}
            />
          {/each}
        </div>

        {#if activeWildReels.has(reelIndex) && !(frame.expandingWild?.reel === reelIndex && (motion === 'spinning' || motion === 'landed'))}
          <div
            class:fresh={frame.expandingWild?.reel === reelIndex && (motion === 'expanding' || motion === 'win')}
            class:persistent={frame.expandingWild?.reel !== reelIndex}
            class:spirit={frame.expandingWild?.kind === 'spirit' && frame.expandingWild.reel === reelIndex}
            class="wild-expansion"
            aria-label={`${frame.expandingWild?.kind === 'spirit' && frame.expandingWild.reel === reelIndex ? 'Possessed' : 'Wax Seal'} Wild reel ${reelIndex + 1}`}
          >
            <span class="wax-fill"></span>
            <span class="wild-surge wild-surge-one" aria-hidden="true"></span>
            <span class="wild-surge wild-surge-two" aria-hidden="true"></span>
            <span class="wild-rays" aria-hidden="true"></span>
            <img
                src={frame.expandingWild?.kind === 'spirit' && frame.expandingWild.reel === reelIndex ? assetUrl('symbols/seance-mirror.webp') : assetUrl('symbols/wax-wild.webp')}
              alt=""
            />
            <strong>×{frame.expandingWild?.reel === reelIndex ? frame.expandingWild.multiplier : frame.multiplier}</strong>
            <small>{frame.expandingWild?.kind === 'spirit' && frame.expandingWild.reel === reelIndex ? 'POSSESSED REEL' : 'EXPANDED WILD'}</small>
          </div>
        {/if}
      </div>
    {/each}

    {#if motion === 'win' && pathPositions.length >= 3}
      <svg class="ways-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={pathPoints}></polyline>
        {#each pathPositions as position}
          <circle cx={(position.reel + 0.5) * 20} cy={(position.row + 0.5) * 25} r="1.55"></circle>
        {/each}
      </svg>
    {/if}

    {#if motion === 'landed' && frame.expandingWild}
      <div class="expansion-warning" style={`--target-reel:${frame.expandingWild.reel}`}>
              <img src={assetUrl('symbols/wax-wild.webp')} alt="" />
        <span>THE SEAL IS BREAKING</span>
      </div>
    {/if}

    {#if isBigWin}
      <div class="win-burst" aria-hidden="true">
        {#each Array.from({ length: 10 }) as _, index}
          <i style={`--piece:${index}`}></i>
        {/each}
      </div>
    {/if}
  </div>

  <div
    class:visible={motion === 'win' && Boolean(frame.winBreakdown)}
    class:major={isBigWin}
    class:portrait={breakdownSymbol?.tier === 'premium'}
    class:heirloom={breakdownSymbol?.tier === 'high' || breakdownSymbol?.tier === 'low'}
    class:collection={frame.winBreakdown?.kind === 'collection'}
    class:spirit={frame.expandingWild?.kind === 'spirit'}
    class="win-explanation"
  >
    {#if frame.winBreakdown && breakdownSymbol}
      <img src={breakdownSymbol.image} alt="" />
      <div class="win-reason">
        <small>{frame.winBreakdown.kind === 'collection' ? 'WHY THE VAULT PAID' : 'WHY THIS WON'}</small>
        <strong>{frame.winBreakdown.title}</strong>
        <span>{frame.winBreakdown.detail}</span>
      </div>
      <div class="win-calculation">
        <small>{frame.winBreakdown.calculation}</small>
        <strong>{frame.spinWinMultiplier.toLocaleString('en', { maximumFractionDigits: 2 })}×</strong>
        <span>FEATURE TOTAL {frame.cumulativeWinMultiplier.toLocaleString('en', { maximumFractionDigits: 2 })}×</span>
      </div>
    {/if}
  </div>

  {#if frame.phase === 'vault'}
    <div class="vault-progress" aria-label={`${frame.lockedValues} of 20 estate values locked`}>
      <span style={`width:${Math.min(54, (frame.lockedValues / 20) * 54)}%`}></span>
      <small>{frame.respinsLeft === 0 ? 'THE VAULT IS SETTLED' : 'A NEW VALUE RESETS RESPINS TO THREE'}</small>
    </div>
  {/if}

  {#if frame.phase === 'codicil' || book.outcome.feature === 'codicil'}
    <div class="codicil-track" aria-label="Final Codicil stages">
      <span class:active={frame.phase === 'will'} class:complete={frame.phase !== 'will'}>I · WILL</span>
      <i></i>
      <span class:active={frame.phase === 'vault'} class:complete={frame.phase === 'seance'}>II · VAULT</span>
      <i></i>
      <span class:active={frame.phase === 'seance'}>III · SÉANCE</span>
    </div>
  {/if}
</section>
