<script lang="ts">
  import { SYMBOL_BY_KEY, type SymbolKey } from '../lib/symbols';

  export let symbolKey: SymbolKey;
  export let winning = false;
  export let spinning = false;
  export let settling = false;
  export let locking = false;
  export let dimmed = false;
  export let prizeValue: number | undefined = undefined;
  export let reelIndex = 0;
  export let rowIndex = 0;

  $: symbol = SYMBOL_BY_KEY[symbolKey];
  $: displayedPrize = prizeValue?.toLocaleString('en', { maximumFractionDigits: 2 });
</script>

<div
  class:winning
  class:spinning
  class:settling
  class:locking
  class:dimmed
  class:special={symbol.tier === 'special'}
  class:wild={symbolKey === 'WILD'}
  class:vault={symbolKey === 'VAULT'}
  class="symbol-tile"
  style={`--symbol-color:${symbol.color};--symbol-glow:${symbol.glow};--win-delay:${reelIndex * 65 + rowIndex * 22}ms;--idle-delay:${(reelIndex * 4 + rowIndex) * -170}ms`}
  title={symbol.label}
  aria-label={prizeValue ? `${symbol.label}, ${prizeValue} times prize` : symbol.label}
>
  <img class="symbol-art" src={symbol.image} alt="" draggable="false" />
  <span class="ink-edge" aria-hidden="true"></span>
  <span class="symbol-sheen" aria-hidden="true"></span>
  <span class="symbol-focus-ring" aria-hidden="true"></span>
  {#if prizeValue}
    <strong class="prize-value">{displayedPrize}×</strong>
  {/if}
</div>
