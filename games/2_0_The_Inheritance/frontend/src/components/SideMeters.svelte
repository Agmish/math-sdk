<script lang="ts">
  import type { BookEvent, SpinBook } from '../lib/books';

  export let book: SpinBook;
  export let side: 'clause' | 'estate';

  function eventOf<T extends BookEvent['type']>(
    source: SpinBook,
    type: T,
  ): Extract<BookEvent, { type: T }> | undefined {
    return source.events.find((event): event is Extract<BookEvent, { type: T }> => event.type === type);
  }

  $: clause = eventOf(book, 'clauseSelected');
  $: vault = eventOf(book, 'vaultState');
  $: seance = eventOf(book, 'seancePossess');
  $: freeSpins = eventOf(book, 'freeSpins');
  $: testamentCount = book.board.flat().filter((symbol) => symbol === 'TESTAMENT').length;
  $: specialCount = book.board.flat().filter((symbol) => ['TESTAMENT', 'VAULT', 'MIRROR'].includes(symbol)).length;
  $: meterValue = Math.round((book.outcome.meter / 15) * 100);
  $: chapterTitle = book.outcome.feature === 'vault'
    ? 'THE KEY'
    : book.outcome.feature === 'seance'
      ? 'THE MIRROR'
      : book.outcome.feature === 'codicil'
        ? 'THE CODICIL'
        : 'THE WILL';
  $: chapterValue = book.outcome.feature === 'vault'
    ? `${vault?.respins ?? 3} RESPINS`
    : clause?.label ?? (freeSpins ? `${freeSpins.current} / ${freeSpins.total}` : `${Math.min(testamentCount, 3)} / 3`);
  $: chapterDetail = book.outcome.feature === 'vault'
    ? 'Every new estate value resets the counter.'
    : book.outcome.feature === 'seance'
      ? 'Séance spins feed the roaming ancestral mirror.'
      : book.outcome.feature === 'codicil'
        ? 'The will, vault and séance resolve in one round.'
        : clause
          ? 'Clause active for this independent round.'
          : freeSpins
            ? 'Testament spins remaining in the current result.'
            : 'Three Testaments can open the sealed will.';
</script>

{#if side === 'clause'}
  <aside class="side-meter clause-meter">
    <span class="meter-kicker">{chapterTitle}</span>
    <div class="ink-flourish" aria-hidden="true">§</div>
    <strong>{chapterValue}</strong>
    <small>{chapterDetail}</small>
  </aside>
{:else}
  <aside class="side-meter estate-meter">
    <span class="meter-kicker">THE ESTATE</span>
    <div class="estate-dial" style={`--meter:${meterValue}%`}><b>{meterValue}</b><i>%</i></div>
    <strong>{vault ? `${vault.locks} LOCKS` : seance ? `${seance.reels.length} REELS` : `${specialCount} OMENS`}</strong>
    <small>
      {#if vault}
        Every new estate value resets three respins.
      {:else if seance}
        Possessed reels become wild for the reveal.
      {:else}
        Vaults, Mirrors and Testaments reveal different features.
      {/if}
    </small>
  </aside>
{/if}
