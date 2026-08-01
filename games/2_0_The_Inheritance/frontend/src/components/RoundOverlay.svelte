<script lang="ts">
  import { amountToDisplay } from '../lib/format';
  import { assetUrl } from '../lib/assets';
  import type { PresentationSequence } from '../lib/presentation';

  export let mode: 'intro' | 'summary';
  export let sequence: PresentationSequence;
  export let winAmount: number;
  export let roundCostAmount: number;
  export let currency: string;
  export let social = false;
  export let onContinue: () => void;

  $: isIntro = mode === 'intro';
  $: expandsWild = sequence.frames.some((frame) => Boolean(frame.expandingWild));
  $: usesRespins = sequence.frames.some((frame) => frame.respinsLeft !== null);
  $: transitionArt = assetUrl(`transitions/chapter-${sequence.feature}.webp`);
  $: roundFactLabel = sequence.feature === 'codicil'
    ? 'CHAPTERS'
    : sequence.feature === 'vault'
      ? 'STARTING RESPINS'
      : 'STARTING SPINS';
  $: roundFactValue = sequence.feature === 'codicil'
    ? '3'
    : sequence.feature === 'vault'
      ? '3'
      : String(sequence.frames[0]?.spinsTotal ?? sequence.frames.length);
  $: netAmount = winAmount - roundCostAmount;
  $: profitable = netAmount > 0;
</script>

<div class="round-overlay" role="presentation">
  <div
    class:summary={!isIntro}
    class="round-overlay-card"
    role="dialog"
    aria-modal="true"
    aria-label={isIntro ? sequence.introTitle : sequence.summaryTitle}
    style={`--round-art:url("${transitionArt}")`}
  >
    <span class="round-art" aria-hidden="true"></span>
    <span class="round-stamp" aria-hidden="true">{isIntro ? 'BEGIN' : 'SETTLED'}</span>
    <div class="round-copy">
      <span class="eyebrow">{isIntro ? sequence.introKicker : 'FEATURE COMPLETE'}</span>
      <h2>{isIntro ? sequence.introTitle : sequence.summaryTitle}</h2>
      <p>{isIntro ? sequence.introDetail : sequence.summaryDetail}</p>
      {#if isIntro}
        <div class="round-facts">
          <span><small>{roundFactLabel}</small><strong>{roundFactValue}</strong></span>
          <span><small>EXPANDING WILDS</small><strong>{expandsWild ? 'ACTIVE' : '—'}</strong></span>
          <span><small>RESPINS</small><strong>{usesRespins ? 'ACTIVE' : '—'}</strong></span>
        </div>
      {:else}
        <div class:profit={profitable} class:loss={!profitable} class="summary-win">
          <small>TOTAL RETURN</small>
          <strong>{amountToDisplay(winAmount, currency, 'result')}</strong>
          <span>{sequence.totalPayoutMultiplier.toLocaleString('en', { maximumFractionDigits: 2 })}× BASE {social ? 'PLAY' : 'BET'}</span>
          <div class="settlement-math">
            <span>
              <small>{social ? 'PLAY AMOUNT' : 'ROUND COST'}</small>
              <b>{amountToDisplay(roundCostAmount, currency)}</b>
            </span>
            <span>
              <small>NET RESULT</small>
              <b>{netAmount > 0 ? '+' : ''}{amountToDisplay(netAmount, currency, 'result')}</b>
            </span>
          </div>
        </div>
      {/if}
      <button class="round-overlay-action" type="button" on:click={onContinue}>
        {isIntro ? sequence.introAction : 'Return to Base Game'}
        <small>CLICK OR PRESS SPACE</small>
      </button>
    </div>
  </div>
</div>
