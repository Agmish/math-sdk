<script lang="ts">
  import type { SpinBook } from '../lib/books';
  import { amountToDisplay } from '../lib/format';

  export let replay = false;
  export let loading = false;
  export let message: string | null = null;
  export let book: SpinBook | null = null;
  export let amount = 0;
  export let currency = 'USD';
  export let costMultiplier = 1;
  export let payoutMultiplier = 0;
  export let completed = false;
  export let social = false;
  export let onPlayReplay: () => void;

  $: costAmount = Math.round(amount * costMultiplier);
  $: payoutAmount = Math.round(amount * payoutMultiplier);
</script>

{#if replay}
  <section class:warning={Boolean(message)} class="replay-banner">
    <div>
      <strong>{social ? 'Round Replay' : 'Bet Replay'}</strong>
      <span>
        {#if loading}
          Loading replay data...
        {:else if message}
          {message}
        {:else if book}
          {book.mode} · {amountToDisplay(costAmount, currency)} {social ? 'play' : 'bet'} ·
          {payoutMultiplier.toLocaleString('en', { maximumFractionDigits: 4 })}× ·
          {amountToDisplay(payoutAmount, currency, 'result')} result
        {:else}
          Replay mode active.
        {/if}
      </span>
    </div>
    <button type="button" disabled={loading || !book} on:click={onPlayReplay}>
      {completed ? 'Play Again' : 'Play'}
    </button>
  </section>
{/if}
