// Edit these PDFs and page shortcuts first.
window.BOOKS = {
  swade: {
    order: 1,
    title: "SWADE",
    file: "pdfs/swade.pdf",
    pageOffset: -3,
    defaultPage: 2,
    defaultScale: 1.25,
    defaultVisible: true,
    preload: true,
    pages: [
      { label: "TOC", page: 2 },
      { label: "Index", page: 205 },
      { label: "Edges", page: 58 },
      { label: "Gear", page: 67 },
      { label: "Weapons", page: 71 },
      { label: "Setting Rules", page: 135 }

    ]
  },
  sfc: {
    order: 2,
    title: "SFC",
    file: "pdfs/sfc.pdf",
    pageOffset: -2,
    defaultPage: 2,
    defaultScale: 1.25,
    defaultVisible: true,
    preload: false,
    pages: [
      { label: "TOC", page: 2 },
      { label: "Index", page: 302 },
      { label: "Weapons", page: 50 }
    ]
  },
  starbreaker_core: {
    order: 3,
    title: "Starbreaker Core",
    file: "pdfs/starbreaker_core.pdf",
    pageOffset: -1,
    defaultPage: 2,
    defaultScale: 1.25,
    defaultVisible: true,
    preload: false,
    pages: [
      { label: "TOC", page: 2 },
      { label: "Species", page: 31 },
      { label: "Edges", page: 79 },
      { label: "Gear", page: 85 },
      { label: "Setting Rules", page: 105 }

    ]
  },
  starbreaker_star_marines: {
    order: 4,
    title: "Starbreaker Star Marines",
    file: "pdfs/starbreaker_star_marines.pdf",
    pageOffset: -1,
    defaultPage: 2,
    defaultScale: 1.25,
    defaultVisible: true,
    preload: false,
    pages: [
      { label: "TOC", page: 2 },
      { label: "Professions", page: 21 },
      { label: "Edges", page: 39 },
      { label: "Gear", page: 41 }


    ]
  },
  starbreaker_star_marshals: {
    order: 5,
    title: "Starbreaker Star Marshals",
    file: "pdfs/starbreaker_star_marshals.pdf",
    pageOffset: -1,
    defaultPage: 2,
    defaultScale: 1.25,
    defaultVisible: true,
    preload: false,
    pages: [
      { label: "TOC", page: 2 }
    ]
  },
  fantasy: {
    order: 6,
    title: "SWADE Fantasy Companion",
    file: "pdfs/fantasy.pdf",
    pageOffset: -2,
    defaultPage: 1,
    defaultScale: 1.25,
    defaultVisible: false,
    preload: false,
    pages: [
    { label: "TOC", page: 2 },
    { label: "Ancestries", page: 6 },
    { label: "Gear", page: 47 },
    { label: "Index", page: 268 }
    ]
  },
  chase_ref: {
    order: 7,
    title: "Chase Reference",
    file: "pdfs/chase_ref.pdf",
    pageOffset: 0,
    defaultPage: 1,
    defaultScale: 1,
    defaultVisible: false,
    preload: false,
    pages: [
    ]
  },
  combat_ref: {
    order: 8,
    title: "Combat Reference",
    file: "pdfs/combat_ref.pdf",
    pageOffset: 0,
    defaultPage: 1,
    defaultScale: 1,
    defaultVisible: false,
    preload: true,
    pages: [
    ]
  },
  combat_survival_guide: {
    order: 9,
    title: "Combat Survival Guide v11",
    file: "pdfs/combat_survival_guide.pdf",
    pageOffset: 0,
    defaultPage: 1,
    defaultScale: 1,
    defaultVisible: false,
    preload: false,
    pages: [
    ]
  }
};
