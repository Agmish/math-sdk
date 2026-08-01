<script lang="ts">
  import type { GameModeId } from '../lib/constants';
  import { amountToDisplay, socialText } from '../lib/format';

  export let balanceAmount: number;
  export let currency: string;
  export let betAmount: number;
  export let betLevels: number[];
  export let selectedMode: GameModeId;
  export let disabled = false;
  export let featureDisabled = false;
  export let muted = false;
  export let social = false;
  export let autoplayEnabled = true;
  export let autoplayActive = false;
  export let autoplayRemaining = 0;
  export let onSpin: () => void;
  export let onBetChange: (value: number) => void;
  export let onToggleMute: () => void;
  export let onShowRules: () => void;
  export let onShowFeatures: () => void;
  export let onMaxBet: () => void;
  export let onToggleAnte: () => void;
  export let onToggleAutoplay: () => void;

  $: anteActive = selectedMode === 'HEIRLOOM_ANTE';
  $: totalCost = betAmount * (anteActive ? 3 : 1);
  $: betIndex = Math.max(0, betLevels.indexOf(betAmount));

  function stepBet(direction: -1 | 1) {
    const nextIndex = Math.min(betLevels.length - 1, Math.max(0, betIndex + direction));
    const next = betLevels[nextIndex];
    if (next !== undefined && next !== betAmount) onBetChange(next);
  }
</script>

<section class="control-deck" aria-label="Game controls">
  <div class="control-readout balance-readout">
    <span>{socialText('Balance', social)}</span>
    <strong>{amountToDisplay(balanceAmount, currency)}</strong>
    <small>AVAILABLE TO PLAY</small>
  </div>

  <button class="deck-button feature-trigger" type="button" disabled={disabled || featureDisabled} on:click={onShowFeatures}>
    <i class="bonus-gem" aria-hidden="true"></i>
    <span>{social ? 'FEATURES' : 'CHOOSE BONUS'}</span>
    <small>4 CHAPTERS</small>
  </button>

  <button
    class:active={anteActive}
    class="ante-button"
    type="button"
    disabled={disabled}
    on:click={onToggleAnte}
    aria-pressed={anteActive}
  >
    <i aria-hidden="true"></i>
    <span>HEIRLOOM ANTE</span>
    <strong>{anteActive ? `ON · 3× ${social ? 'PLAY' : 'BET'}` : 'OFF · MORE BONUS SYMBOLS'}</strong>
  </button>

  <div class="bet-stepper" aria-label={social ? 'Play amount controls' : 'Bet controls'}>
    <button type="button" disabled={disabled || betIndex <= 0} on:click={() => stepBet(-1)} aria-label={social ? 'Lower play amount' : 'Lower bet'}>−</button>
    <div>
      <span>{socialText('Bet', social)}</span>
      <strong>{amountToDisplay(totalCost, currency)}</strong>
      {#if anteActive}<small>BASE {amountToDisplay(betAmount, currency)}</small>{/if}
    </div>
    <button type="button" disabled={disabled || betIndex >= betLevels.length - 1} on:click={() => stepBet(1)} aria-label={social ? 'Raise play amount' : 'Raise bet'}>+</button>
  </div>

  <button class="spin-button" type="button" disabled={disabled} on:click={onSpin} aria-label="Spin">
    <span class="spin-arrows" aria-hidden="true"></span>
    <strong>SPIN</strong>
    <small>PRESS SPACE</small>
  </button>

  <div class:auto-present={autoplayEnabled || autoplayActive} class="utility-controls">
    <button class="deck-button rules-trigger" type="button" on:click={onShowRules} aria-label={social ? 'Rules and award table' : 'Rules and paytable'}>
      <i class="info-icon">i</i><span>WAYS &amp; {social ? 'AWARDS' : 'PAYTABLE'}</span>
    </button>
    <button class="deck-button" type="button" on:click={onToggleMute} aria-label="Toggle sound">
      <i class:muted class="sound-icon" aria-hidden="true"><b></b></i><span>{muted ? 'SOUND OFF' : 'SOUND ON'}</span>
    </button>
    <button class="deck-button" type="button" disabled={disabled} on:click={onMaxBet} aria-label={social ? 'Maximum play amount' : 'Maximum bet'}>
      <i class="max-icon">+</i><span>MAX {social ? 'PLAY' : 'BET'}</span>
    </button>
    {#if autoplayEnabled || autoplayActive}
      <button
        class:active={autoplayActive}
        class="deck-button auto-control"
        type="button"
        disabled={!autoplayActive && disabled}
        on:click={onToggleAutoplay}
        aria-label={autoplayActive ? 'Stop automatic play' : `Configure ${social ? 'auto play' : 'auto bet'}`}
      >
        <i aria-hidden="true">{autoplayActive ? '■' : 'A'}</i>
        <span>{autoplayActive ? `STOP · ${autoplayRemaining}` : social ? 'AUTO PLAY' : 'AUTO BET'}</span>
      </button>
    {/if}
  </div>
</section>
