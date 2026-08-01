<script lang="ts">
  export let open = false;
  export let social = false;
  export let onCancel: () => void;
  export let onConfirm: (rounds: number) => void;

  let rounds = 10;
  const choices = [10, 25, 50];
</script>

{#if open}
  <div class="modal-backdrop confirm-layer" role="presentation">
    <button class="modal-close-layer" type="button" aria-label="Cancel automatic play" on:click={onCancel}></button>
    <div class="feature-confirm autoplay-confirm" role="dialog" aria-modal="true" aria-label="Confirm automatic play">
      <div class="confirm-copy">
        <span class="eyebrow">Optional control</span>
        <span class="confirm-type">{social ? 'AUTO PLAY' : 'AUTO BET'}</span>
        <h2>Choose a fixed number of rounds</h2>
        <p>
          Each round uses the current amount and mode. Automatic play stops if the balance is insufficient,
          a feature opens, an error occurs, or you press Stop.
        </p>
        <div class="auto-count-options" aria-label="Automatic round count">
          {#each choices as choice}
            <button type="button" class:active={rounds === choice} on:click={() => (rounds = choice)}>
              {choice}
            </button>
          {/each}
        </div>
        <p class="disclaimer">No result is guaranteed. Every round is independent.</p>
        <div class="confirm-actions">
          <button type="button" class="text-button" on:click={onCancel}>Cancel</button>
          <button type="button" class="feature-confirm-button" on:click={() => onConfirm(rounds)}>
            Start {social ? 'Auto Play' : 'Auto Bet'} · {rounds}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
