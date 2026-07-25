// Edit this structure to add/remove collapsible sections and nested note blocks.
window.SIDEBAR_SECTIONS = [
  {
    title: "Session Control",
    intro: "Fast shortcuts for common rules and references.",
    blocks: [
      {
        title: "Combat Reference",
        text: "Open the combat page when a fight starts or you need a quick rule lookup.",
        links: [
          { label: "Combat (SWADE)", tab: "swade", page: 79 },
          { label: "SWADE Index", tab: "swade", page: 206 }
        ]
      },
      {
        title: "Core Rules",
        text: "Use this for broad table questions and the general rules framework.",
        links: [
          { label: "Core Rules", tab: "starbreaker_core", page: 14 },
          { label: "GM Tools", tab: "starbreaker_core", page: 137 }
        ]
      }
    ]
  },
  {
    title: "Campaign Notes",
    intro: "Add NPCs, clues, factions, locations, and reminders here.",
    blocks: [
      {
        title: "NPCs",
        text: "Put important recurring people here.",
        links: [
          { label: "SFC Characters", tab: "sfc", page: 12 }
        ]
      },
      {
        title: "Factions / Units",
        text: "Keep important organization or team references here.",
        links: [
          { label: "Star Marines", tab: "starbreaker_star_marines", page: 18 }
        ]
      },
      {
        title: "Adventures",
        text: "Open the adventure section when the table moves into mission mode.",
        links: [
          { label: "SFC Adventures", tab: "sfc", page: 124 }
        ]
      }
    ]
  },
  {
    title: "Custom Links",
    intro: "This is a blank area you can build on.",
    blocks: [
      {
        title: "Your Notes",
        text: "Replace this with whatever you want to keep on screen during play.",
        links: []
      }
    ]
  }
];
