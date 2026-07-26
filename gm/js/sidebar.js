// Edit this structure to add/remove collapsible sections and nested note blocks.
window.SIDEBAR_SECTIONS = [
  {
    title: "General",
    intro: "",
    blocks: [
      {
        title: "Combat Reference",
        html: `
          <div class="stack">
            <a class="btn jump-link" href="#" data-tab="swade" data-page="90">Combat</a>
            <a class="btn jump-link" href="#" data-tab="swade" data-page="92">Attack</a>
            <a class="btn jump-link" href="#" data-tab="swade" data-page="93">Shaken</a>
            <a class="btn jump-link" href="#" data-tab="swade" data-page="95">Soak</a>
          </div>
        `
      },
      {
        title: "Other Rules",
        html: `
          <div class="stack">
            <a class="btn jump-link" href="#" data-tab="swade" data-page="89">Bennies</a>
          </div>
        `
      }
    ]
  },
  {
    title: "Current Session",
    intro: "",
    blocks: [
      {
        title: "Jean Grayson",
        html: `
          <div class="stack">
            Profession: <a class="linkicon jump-link" href="#" data-tab="starbreaker_star_marines" data-page="33">Psy Commando</a>
          </div>

          <details class="subsection" open data-persist-key="jean-grayson-weapons">
            <summary>Weapons</summary>
            <div class="subsection-body">
              <table class="sidebar-table">
                <thead>
                  <tr>
                    <th>Weapon</th>
                    <th>Range</th>
                    <th>AP</th>
                    <th>Damage</th>
                    <th>ROF</th>
                    <th>Shots</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="link-row" tabindex="0" role="button" aria-label="PsyFocus" data-tab="starbreaker_core" data-page="120">
                    <td>PsyFocus Loadout & Advanced</td>
                    <td>15/30/60</td>
                    <td>2</td>
                    <td>2d6</td>
                    <td>4</td>
                    <td>100</td>
                    <td></td>
                  </tr>
                  <tr class="link-row" tabindex="0" role="button" aria-label="Open Gatling Laser" data-tab="sfc" data-page="54" data-highlight="Gatling Laser">
                    <td>Gatling Laser</td>
                    <td>50/100/200</td>
                    <td>4</td>
                    <td>3d6+4</td>
                    <td>4</td>
                    <td>80</td>
                    <td>Cauterize, Heavy Weapon, No Recoil, Overcharge, Snapfire</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

          <details class="subsection" data-persist-key="jean-grayson-edges">
            <summary>Edges</summary>
            <div class="subsection-body">
                <ul class="note-list">
                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="swade" data-page="38" data-highlight="FLEET-FOOTED">Fleet-Footed</a>:
                    When sneaking behind enemy lines, it’s good to go fast. You have +2 Pace and a d8 Running die.
                  </li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_core" data-page="119" data-highlight="ARCANE BACKGROUND (PSY COMMANDO)">Arcane Background (Psy Commando)</a>:
                    As a psychic warrior, your mind is a weapon. Enemy powers used against you suffer a –2 penalty to their rolls and deal 2 less damage.
                  </li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_core" data-page="120">Basic Psychic Loadout</a>:
                    Even without your PsyFocus, you have the powers <em>arcane protection</em>, <em>boost/lower Trait</em> (boost only, self only), <em>smite</em> (self only), and <em>wall walker</em> (self only). You can also spend a Power Point to telepathically link up to 8 allies per the <em>mind link</em> power.
                  </li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_core" data-page="120">PsyFocus Loadout</a>:
                    While wielding a PsyFocus, you have 5 additional Power Points and the powers <em>bolt</em>, <em>invisibility</em>, and <em>sound/silence</em>.
                  </li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_core" data-page="120">Advanced PsyFocus Loadout</a>:
                    While wielding a PsyFocus, you have the powers <em>barrier</em>, <em>blast</em>, and <em>telekinesis</em>.
                  </li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_star_marines" data-page="33">Living Weapon</a>:
                    By channeling their psychic energies through their own flesh, psy commandos can enhance their natural capabilities. Once per encounter, as a limited free action, the psy-co may spend a Power Point to gain the benefits of one Combat Edge of his Rank or less, regardless of its other Requirements, until the end of the encounter. He can’t choose an Edge he already has, or that is currently active.
                  </li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_star_marines" data-page="40">Heavy Hitters Squad Edge</a>:
                    The squad is equipped with experimental weapons that occasionally punch well above their weight class. When a squad member makes an attack with a firearm, he can spend a Benny to declare that it’s a “heavy” attack. If the attack hits, it has +4 AP and deals Heavy Damage.
                  </li>
                </ul>
            </div>
          </details>

          <details class="subsection" data-persist-key="jean-grayson-armor">
            <summary>Armor</summary>
            <div class="subsection-body">
            <ul>
 

             <li> <a class="linkicon jump-link" href="#" data-tab="starbreaker_star_marines" data-page="42">Star Marine Armor (+6*)</a></li>
              <ul>
              <li>Targeting system</li>
              <li>Ignore 2 point penalties</li>
              <li>Life support (20 days)</li></ul>
             <li>Magnetic boots</li>
</ul>
            </div>
          </details>

          <details class="subsection" data-persist-key="jean-grayson-powers">
            <summary>Powers</summary>
            <div class="subsection-body">
              <p class="nested-text">Add powers, abilities, or psychic notes here.</p>
            </div>
          </details>

          <details class="subsection" data-persist-key="jean-grayson-gear">
            <summary>Gear</summary>
            <div class="subsection-body">
              <p class="nested-text">Add gear, upgrades, or equipment notes here.</p>
            </div>
          </details>
        `
      }
    ]
  }
];
