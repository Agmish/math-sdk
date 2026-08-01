<script lang="ts">
  import { GAME_MODES, type GameMode, type GameModeId } from '../lib/constants';
  import { amountToDisplay, socialText } from '../lib/format';
  import { probabilityBelowCost, zeroReturnProbability } from '../lib/mathProfile';

  export let betAmount: number;
  export let balanceAmount: number;
  export let currency: string;
  export let open = false;
  export let disabled = false;
  export let social = false;
  export let showRtp = true;
  export let onClose: () => void;
  export let onBuy: (value: GameModeId) => void;

  let pendingMode: GameMode | null = null;
  const featureIdentity: Partial<Record<GameModeId, { type: string; verb: string; result: string }>> = {
    SEALED_WILL_BUY: {
      type: 'EXPANDING-WILD FREE SPINS',
      verb: 'SEALS EXPAND',
      result: 'A Wax Seal expands into a Wild reel and displays the exact published award for every reveal.',
    },
    VAULT_ECHOES_BUY: {
      type: 'HOLD & RESPIN',
      verb: 'VALUES STAY',
      result: 'Six Vault Keys lock their displayed estate values and build one visible collection.',
    },
    MIDNIGHT_SEANCE_BUY: {
      type: 'ROAMING-WILD FREE SPINS',
      verb: 'MIRROR MOVES',
      result: 'The Mirror turns one complete reel Wild each spin; first visits to new reels increase feature power.',
    },
    FINAL_CODICIL_BUY: {
      type: 'THREE-STAGE FEATURE',
      verb: 'UPGRADES CARRY',
      result: 'Build Wild reels, collect Vault values, then reuse the inherited Wild reels in the Séance.',
    },
  };
  $: buyModes = GAME_MODES.filter((mode) => mode.isBuyBonus);
  $: buyLabel = social ? 'Play Feature' : 'Buy Bonus';

  function chooseMode(mode: GameMode) {
    if (disabled) return;
    pendingMode = mode;
  }

  function confirmMode() {
    if (!pendingMode) return;
    const modeId = pendingMode.id;
    pendingMode = null;
    onClose();
    onBuy(modeId);
  }

  function cancelAll() {
    pendingMode = null;
    onClose();
  }
</script>

{#if open}
  <div class="modal-backdrop feature-layer" role="presentation">
    <button class="modal-close-layer" type="button" aria-label="Close feature menu" on:click={cancelAll}></button>
    <section class="feature-menu feature-drawer" aria-label={social ? 'Feature menu' : 'Bonus buy menu'}>
      <header class="feature-menu-heading">
        <div>
          <span class="eyebrow">Choose one complete round</span>
          <h2>{buyLabel}</h2>
        </div>
        <div class="feature-menu-explainer">
          <p>
            Each feature uses a different game engine. The displayed price is the complete {social ? 'play amount' : 'round cost'};
            no feature guarantees a win.
          </p>
          <span><strong>REAL WEIGHTED RESULTS</strong>{#if showRtp} · 96.00% theoretical RTP · 4.00% house edge{/if} · a 0× return is possible</span>
        </div>
        <button class="text-button" type="button" on:click={cancelAll}>Close</button>
      </header>

      <div class="feature-grid">
        {#each buyModes as mode, index}
          <button
            class="feature-card"
            type="button"
            disabled={disabled || balanceAmount < mode.costMultiplier * betAmount}
            style={`--mode-accent:${mode.accent}`}
            on:click={() => chooseMode(mode)}
          >
            <span class="feature-card-art" aria-hidden="true">
              <img src={mode.featureArt} alt="" />
            </span>
            <span class="feature-number">0{index + 1}</span>
            <span class="feature-card-copy">
              <em>{mode.startingAward}</em>
              <span class="feature-type">{featureIdentity[mode.id]?.type}</span>
              <strong>{mode.label}</strong>
              <span class="feature-identity">
                <b>{featureIdentity[mode.id]?.verb}</b>
                <small>{featureIdentity[mode.id]?.result}</small>
              </span>
              <p>{mode.mechanicPreview}</p>
              <span class="feature-price">
                <small>{mode.costMultiplier}× {social ? 'PLAY' : 'BET'}</small>
                <b>{amountToDisplay(mode.costMultiplier * betAmount, currency)}</b>
              </span>
              <span class="feature-volatility">
                {mode.volatility} · {(probabilityBelowCost(mode.id) * 100).toFixed(1)}% BELOW {social ? 'PLAY AMOUNT' : 'COST'} ·
                {(zeroReturnProbability(mode.id) * 100).toFixed(1)}% ZERO RETURN
              </span>
            </span>
          </button>
        {/each}
      </div>
    </section>
  </div>
{/if}

{#if pendingMode}
  <div class="modal-backdrop confirm-layer" role="presentation">
    <button class="modal-close-layer" type="button" aria-label="Cancel feature selection" on:click={() => (pendingMode = null)}></button>
    <div
      class="feature-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm ${pendingMode.label}`}
    >
      <div class="confirm-art">
        <img src={pendingMode.featureArt} alt="" aria-hidden="true" />
        <span>{pendingMode.startingAward}</span>
      </div>
      <div class="confirm-copy">
        <span class="eyebrow">{buyLabel}</span>
        <span class="confirm-type">{featureIdentity[pendingMode.id]?.type}</span>
        <h2>{pendingMode.label}</h2>
        <div class="confirm-identity">
          <strong>{featureIdentity[pendingMode.id]?.verb}</strong>
          <span>{featureIdentity[pendingMode.id]?.result}</span>
        </div>
        <p>{socialText(pendingMode.rules, social)}</p>
        <ul>
          {#each pendingMode.featureBullets ?? [] as bullet}
            <li>{bullet}</li>
          {/each}
        </ul>
        <dl>
          <div><dt>{social ? 'Play amount' : 'Feature cost'}</dt><dd>{amountToDisplay(pendingMode.costMultiplier * betAmount, currency)}</dd></div>
          {#if showRtp}<div><dt>Theoretical RTP</dt><dd>{pendingMode.rtpLabel}</dd></div>{/if}
          {#if showRtp}<div><dt>House edge</dt><dd>{((1 - pendingMode.rtp) * 100).toFixed(2)}%</dd></div>{/if}
          <div><dt>Returns below {social ? 'play amount' : 'cost'}</dt><dd>{(probabilityBelowCost(pendingMode.id) * 100).toFixed(1)}%</dd></div>
          <div><dt>Base {social ? 'play' : 'bet'}</dt><dd>{amountToDisplay(betAmount, currency)}</dd></div>
          <div><dt>Maximum</dt><dd>{pendingMode.maxWinMultiplier.toLocaleString('en')}×</dd></div>
        </dl>
        <p class="disclaimer">
          The feature is one independent round. It may return zero or less than its {social ? 'play amount' : 'cost'}; RTP is measured over many rounds.
        </p>
        <div class="confirm-actions">
          <button type="button" class="text-button" on:click={() => (pendingMode = null)}>Cancel</button>
          <button
            type="button"
            class="feature-confirm-button"
            disabled={balanceAmount < pendingMode.costMultiplier * betAmount}
            on:click={confirmMode}
          >
            {buyLabel} · {pendingMode.costMultiplier}×
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
