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
    <span class="control-icon wallet-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M4 6.5h13.5a2 2 0 0 1 2 2V18H4a2 2 0 0 1-2-2V6.5A2.5 2.5 0 0 1 4.5 4H17"/><path d="M15 11h6v4h-6a2 2 0 1 1 0-4Z"/><circle cx="15.2" cy="13" r=".65"/></svg>
    </span>
    <span class="readout-copy">
      <small>{socialText('Balance', social)}</small>
      <strong>{amountToDisplay(balanceAmount, currency)}</strong>
    </span>
  </div>

  <div class="mode-controls">
    <button class="deck-button feature-trigger" type="button" disabled={disabled || featureDisabled} on:click={onShowFeatures}>
      <span class="control-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m12 2 3 4.1L20 8l-2.4 4.5.4 5.5-6 4-6-4 .4-5.5L4 8l5-1.9L12 2Z"/><path d="m9.2 12 1.8 1.8 4-4"/></svg>
      </span>
      <span class="button-copy"><strong>{social ? 'FEATURES' : 'BONUS MODES'}</strong><small>4 DISTINCT CHAPTERS</small></span>
    </button>

    <button
      class:active={anteActive}
      class="ante-button"
      type="button"
      disabled={disabled}
      on:click={onToggleAnte}
      aria-pressed={anteActive}
    >
      <span class="ante-switch" aria-hidden="true"><i></i></span>
      <span class="button-copy">
        <strong>HEIRLOOM ANTE</strong>
        <small>{anteActive ? `ACTIVE · 3× ${social ? 'PLAY' : 'BET'}` : 'MORE BONUS SYMBOLS'}</small>
      </span>
    </button>
  </div>

  <div class="bet-stepper" aria-label={social ? 'Play amount controls' : 'Bet controls'}>
    <button class="step-button" type="button" disabled={disabled || betIndex <= 0} on:click={() => stepBet(-1)} aria-label={social ? 'Lower play amount' : 'Lower bet'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>
    </button>
    <div class="bet-value">
      <span>{socialText('Bet', social)} {anteActive ? '· TOTAL' : ''}</span>
      <strong>{amountToDisplay(totalCost, currency)}</strong>
      {#if anteActive}<small>BASE {amountToDisplay(betAmount, currency)}</small>{/if}
    </div>
    <button class="step-button" type="button" disabled={disabled || betIndex >= betLevels.length - 1} on:click={() => stepBet(1)} aria-label={social ? 'Raise play amount' : 'Raise bet'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>
    </button>
  </div>

  <button class="spin-button" type="button" disabled={disabled} on:click={onSpin} aria-label="Spin">
    <span class="spin-halo" aria-hidden="true"></span>
    <svg class="spin-glyph" viewBox="0 0 48 48" aria-hidden="true"><path d="M37.8 17.2A16 16 0 1 0 39 28"/><path d="M30.5 8.8h8.8v8.8"/></svg>
    <strong>SPIN</strong>
  </button>

  <div class:auto-present={autoplayEnabled || autoplayActive} class="utility-controls">
    <button class="deck-button rules-trigger" type="button" on:click={onShowRules} aria-label={social ? 'Rules and award table' : 'Rules and paytable'}>
      <span class="control-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.2v.2"/></svg></span>
      <span>INFO</span>
    </button>
    <button class="deck-button" type="button" on:click={onToggleMute} aria-label="Toggle sound">
      <span class:muted class="control-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path class="sound-wave" d="M16 9c1.4 1.6 1.4 4.4 0 6M19 6.5c3.2 3.2 3.2 7.8 0 11"/><path class="mute-slash" d="m5 5 14 14"/></svg></span>
      <span>{muted ? 'SOUND OFF' : 'SOUND'}</span>
    </button>
    <button class="deck-button" type="button" disabled={disabled} on:click={onMaxBet} aria-label={social ? 'Maximum play amount' : 'Maximum bet'}>
      <span class="control-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 17 10 7l3.2 6L16 9l3 8"/><path d="M4 20h16"/></svg></span>
      <span>MAX {social ? 'PLAY' : 'BET'}</span>
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
        <span class="control-icon" aria-hidden="true">
          {#if autoplayActive}
            <svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
          {:else}
            <svg viewBox="0 0 24 24"><path d="M18 8a7 7 0 1 0 .8 7"/><path d="M18 4v4h-4"/><path d="M10 15h4M12 9v6"/></svg>
          {/if}
        </span>
        <span>{autoplayActive ? `STOP · ${autoplayRemaining}` : social ? 'AUTO PLAY' : 'AUTO BET'}</span>
      </button>
    {/if}
  </div>
</section>
