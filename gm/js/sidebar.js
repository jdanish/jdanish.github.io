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
            <a class="btn jump-link"
               href="#"
               data-tab="swade"
               data-page="93">
              Combat
            </a>
            <a class="btn jump-link"
               href="#"
               data-tab="swade"
               data-page="95">
              Attack
            </a>
             <a class="btn jump-link"
               href="#"
               data-tab="swade"
               data-page="98">
              Soak
            </a>
          </div>
        `
      },

      {
        title: "Other Rules",
        html: `
          <div class="stack">
            <a class="btn jump-link"
               href="#"
               data-tab="swade"
               data-page="91">
              Bennies
            </a>
          </div>
        `
      }
    ]
  }
    ,
{
    title: "Current Session",
    intro: "",
    blocks: [
      {
        title: "Jean Grayson",
        html: `
          <div class="stack">
            <a class="btn jump-link"
               href="#"
               data-tab="starbreaker_star_marines"
               data-page="34">
              Psy Commando Profession
            </a>
          </div>
        `
      }
    ]
  }
];
