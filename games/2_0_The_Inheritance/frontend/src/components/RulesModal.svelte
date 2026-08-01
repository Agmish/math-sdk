<script lang="ts">
  import { GAME_MODES, GAME_SUBTITLE, GAME_TITLE, MAX_WIN_MULTIPLIER, RTP_LABEL } from '../lib/constants';
  import { assetUrl } from '../lib/assets';
  import { multiplierToDisplay, socialText } from '../lib/format';
  import { probabilityBelowCost, zeroReturnProbability } from '../lib/mathProfile';
  import { SYMBOLS } from '../lib/symbols';

  export let open = false;
  export let social = false;
  export let showRtp = true;
  export let onClose: () => void;

  let activeTab: 'win' | 'bonuses' | 'paytable' = 'win';
  $: bonusModes = GAME_MODES.filter((mode) => mode.isBuyBonus);
  const bonusTypes = [
    'EXPANDING-WILD FREE SPINS',
    'HOLD & RESPIN',
    'ROAMING-WILD FREE SPINS',
    'THREE-STAGE FEATURE',
  ];
</script>

{#if open}
  <div class="modal-backdrop" role="presentation">
    <button class="modal-close-layer" type="button" aria-label="Close rules" on:click={onClose}></button>
    <div class="rules-modal stats-drawer" role="dialog" aria-modal="true" aria-label={social ? 'Rules and award table' : 'Rules and paytable'} tabindex="-1">
      <header>
        <div>
          <p class="eyebrow">Rules · {social ? 'Awards' : 'Paytable'} · Feature Guide</p>
          <h2>{GAME_TITLE}</h2>
          <span>{GAME_SUBTITLE}</span>
        </div>
        <button type="button" class="text-button" on:click={onClose}>Close</button>
      </header>

      <nav class="rules-tabs" aria-label="Game guide sections">
        <button class:active={activeTab === 'win'} type="button" on:click={() => (activeTab = 'win')}>How wins work</button>
        <button class:active={activeTab === 'bonuses'} type="button" on:click={() => (activeTab = 'bonuses')}>Four bonuses</button>
        <button class:active={activeTab === 'paytable'} type="button" on:click={() => (activeTab = 'paytable')}>Picture {social ? 'awards' : 'paytable'}</button>
      </nav>

      <div class="rules-grid">
        {#if activeTab === 'win'}
          <article class="rules-lead ways-lesson">
            <div>
              <span class="eyebrow">This game uses ways, not fixed paylines</span>
              <h3>Connect matching pictures from the left</h3>
              <p>
                A win needs the same picture on at least three adjacent reels, beginning on reel 1. The pictures
                may sit on different rows. When a reveal wins, a gold path joins one valid route and the panel
                below the reels shows the symbol, reels, number of ways and feature multiplier.
              </p>
            </div>
            <div class="ways-example" aria-label="Example win: The Heiress connects across four adjacent reels">
              {#each [[1, 3], [2], [0, 2], [3], []] as winningRows, reel}
                <div class="example-reel">
                  {#each [0, 1, 2, 3] as row}
                    <span class:hit={winningRows.includes(row)}>
                      {#if winningRows.includes(row)}<img src={assetUrl('symbols/heiress.webp')} alt="" />{/if}
                    </span>
                  {/each}
                  <small>R{reel + 1}</small>
                </div>
              {/each}
            </div>
            <div class="ways-formula">
              <strong>Example: 2 × 1 × 2 × 1 = 4 winning ways</strong>
              <span>Every matching picture on each connected reel multiplies the number of ways.</span>
              <span>Final award = picture {social ? 'award' : 'pay'} × winning ways × active feature power. The result panel shows every value.</span>
            </div>
          </article>

          <article class="wild-rule">
            <img src={assetUrl('symbols/wax-wild.webp')} alt="" />
            <div>
              <span class="eyebrow">Core Mechanic</span>
              <h3>Expanding Wax Seal Wild</h3>
              <ol>
                <li>The Wax Seal lands as one picture while the reels are stopping.</li>
                <li>After the final reel stops, the seal breaks and wax fills the complete reel.</li>
                <li>Every covered position substitutes for a regular picture.</li>
                <li>The result panel displays the published feature award or evaluated ways calculation.</li>
              </ol>
            </div>
          </article>

          <article class="quick-read">
            <h3>Understand every result in three steps</h3>
            <div>
              <span><b>1</b><strong>Follow the gold path</strong><small>It marks a valid adjacent-reel connection.</small></span>
              <span><b>2</b><strong>Open “Why this won”</strong><small>It identifies the picture, length and number of ways.</small></span>
              <span><b>3</b><strong>Check the calculation</strong><small>Feature power and the running total are shown separately.</small></span>
            </div>
          </article>

          <article class="quick-read">
            <h3>Controls</h3>
            <div>
              <span><b>↻</b><strong>Spin seal / Space</strong><small>Starts one round at the selected play amount.</small></span>
              <span><b>±</b><strong>Amount controls</strong><small>Move through every amount supplied by the game server.</small></span>
              <span><b>4</b><strong>Features</strong><small>Opens the four feature choices and their confirmation screen.</small></span>
              <span><b>i</b><strong>Ways &amp; rules</strong><small>Opens this guide, the feature rules and picture awards.</small></span>
              <span><b>♪</b><strong>Sound</strong><small>Turns all music and effects on or off.</small></span>
              <span><b>+</b><strong>Maximum</strong><small>Selects the highest amount returned by the game server.</small></span>
              <span><b>A</b><strong>{social ? 'Auto Play' : 'Auto Bet'}</strong><small>Requires confirmation and always provides a visible Stop control.</small></span>
            </div>
          </article>
        {:else if activeTab === 'bonuses'}
          <article class="bonus-comparison">
            <span class="eyebrow">Each chapter has one unmistakable job</span>
            <h3>Four different bonus structures</h3>
            <div class="bonus-identity-grid">
              {#each bonusModes as mode, index}
                <section style={`--rule-art:url("${mode.featureArt}");--accent:${mode.accent}`}>
                  <div class="rule-art"></div>
                  <div>
                    <span>CHAPTER {index + 1} · {mode.startingAward}</span>
                    <em>{bonusTypes[index]}</em>
                    <strong>{mode.label}</strong>
                    <p class="mechanic-preview">{mode.mechanicPreview}</p>
                    <p class="rule-math">
                      {#if showRtp}{mode.rtpLabel} RTP · {((1 - mode.rtp) * 100).toFixed(2)}% house edge ·{/if}
                      {(probabilityBelowCost(mode.id) * 100).toFixed(1)}% return below {social ? 'play amount' : 'cost'} ·
                      {(zeroReturnProbability(mode.id) * 100).toFixed(1)}% zero return
                    </p>
                    <p>{socialText(mode.rules, social)}</p>
                    <ul>
                      {#each mode.featureBullets ?? [] as bullet}
                        <li>{socialText(bullet, social)}</li>
                      {/each}
                    </ul>
                  </div>
                </section>
              {/each}
            </div>
          </article>
        {:else}
          <article>
            <span class="eyebrow">All awards multiply the base {social ? 'play' : 'bet'}</span>
            <h3>Picture {social ? 'Awards' : 'Paytable'}</h3>
            <div class="symbol-paytable detailed-paytable">
              {#each SYMBOLS.filter((symbol) => symbol.pays) as symbol}
                <div>
                  <img src={symbol.image} alt="" />
                  <span>{symbol.label}</span>
                  <section class="pay-values">
                    {#each symbol.pays?.slice(2) ?? [] as pay, payIndex}
                      <strong><em>{payIndex + 3} REELS</em>{multiplierToDisplay(pay)}</strong>
                    {/each}
                  </section>
                </div>
              {/each}
            </div>
          </article>

          <article>
            <h3>Scatters and special pictures</h3>
            <div class="symbol-paytable special-paytable">
              {#each SYMBOLS.filter((symbol) => symbol.specialRule) as symbol}
                <div>
                  <img src={symbol.image} alt="" />
                  <span>{symbol.label}</span>
                  <small>{socialText(symbol.specialRule ?? '', social)}</small>
                </div>
              {/each}
            </div>
          </article>

          <article>
            <h3>Mode information and round rules</h3>
            <div class="mode-stat-grid">
              {#each GAME_MODES as mode}
                <div>
                  <strong>{mode.label}</strong>
                  <span>{mode.costMultiplier}× {social ? 'total play' : 'total cost'}</span>
                  {#if showRtp}<span>{mode.rtpLabel} theoretical RTP</span>{/if}
                  <span>{mode.volatility} volatility</span>
                  <small>{mode.featureFrequencyLabel}</small>
                </div>
              {/each}
            </div>
            <p>
              {#if showRtp}Every playable mode uses <strong>{RTP_LABEL}</strong> theoretical RTP and is{/if} capped at
              <strong>{MAX_WIN_MULTIPLIER.toLocaleString('en')}×</strong> the base {social ? 'play' : 'bet'}. A {social ? 'played' : 'purchased'} feature is
              one independent round; free spins or respins do not create a new {social ? 'play' : 'wager'}.
            </p>
            <p>
              Three Testament symbols during The Sealed Will add two free spins. Three Mirror symbols during
              Midnight Séance add two free spins. Vault of Echoes consists of six published lock-and-respin reveals
              and has no retrigger. The Final Codicil always contains five Will, three Vault and three Séance reveals.
            </p>
          </article>
        {/if}
      </div>
      <footer class="rules-disclaimer">
        Malfunction voids all wins and plays. A consistent internet connection is required. In the event of a
        disconnection, reload the game to finish any uncompleted rounds. The expected return is calculated over
        many plays. The game display is not representative of any physical device and is for illustrative purposes
        only. Winnings are settled according to the amount received from the Remote Game Server and not from events
        within the web browser. TM and © 2026 {social ? 'game provider' : 'Stake Engine'}.
      </footer>
    </div>
  </div>
{/if}
