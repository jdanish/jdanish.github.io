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
            <a class="btn jump-link" href="#" data-tab="swade" data-page="93">Combat</a>
            <a class="btn jump-link" href="#" data-tab="swade" data-page="95">Attack</a>
            <a class="btn jump-link" href="#" data-tab="swade" data-page="98">Soak</a>
            <a class="btn jump-link" href="#" data-tab="swade" data-page="96">Shaken</a>
          </div>
        `
      },
      {
        title: "Other Rules",
        html: `
          <div class="stack">
            <a class="btn jump-link" href="#" data-tab="swade" data-page="91">Bennies</a>
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
            <a class="btn jump-link" href="#" data-tab="starbreaker_star_marines" data-page="34">Psy Commando Profession</a>
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
                  <tr class="link-row" tabindex="0" role="button" aria-label="Open Gatling Laser" data-tab="sfc" data-page="54">
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

          <details class="subsection" data-persist-key="jean-grayson-armor">
            <summary>Armor</summary>
            <div class="subsection-body">
              <p class="nested-text">No armor listed yet.</p>
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
