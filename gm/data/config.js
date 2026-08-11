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
    title: "SWADE Science Fiction Companion",
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
    order: 6,
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
    order: 7,
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
    order: 8,
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
    order: 3,
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
   horror: {
    order: 4,
    title: "SWADE Horror Companion",
    file: "pdfs/horror.pdf",
    pageOffset: -2,
    defaultPage: 1,
    defaultScale: 1.25,
    defaultVisible: false,
    preload: false,
    pages: [
    { label: "TOC", page: 2 }
    ]
  },
   spc: {
    order: 5,
    title: "SWADE Super Powers Companion",
    file: "pdfs/spc.pdf",
    pageOffset: -2,
    defaultPage: 1,
    defaultScale: 1.25,
    defaultVisible: false,
    preload: false,
    pages: [
    { label: "TOC", page: 2 }
    ]
  },
    secret_world: {
    order: 9,
    title: "Secret World",
    file: "pdfs/secret_world.pdf",
    pageOffset: -2,
    defaultPage: 1,
    defaultScale: 1.25,
    defaultVisible: false,
    preload: false,
    pages: [
    { label: "TOC", page: 2 }
    ]
  },
  ne_invasion: {
    order: 10,
    title: "Necessary Evil",
    file: "pdfs/ne_invasion.pdf",
    pageOffset: -2,
    defaultPage: 1,
    defaultScale: 1.25,
    defaultVisible: false,
    preload: false,
    pages: [
    { label: "TOC", page: 2 }
    ]
  },
    doom_guard: {
    order: 11,
    title: "Doom Guard",
    file: "pdfs/doom_guard.pdf",
    pageOffset: -2,
    defaultPage: 1,
    defaultScale: 1.25,
    defaultVisible: false,
    preload: false,
    pages: [
    { label: "TOC", page: 2 }
    ]
  },
    occult_city: {
    order: 12,
    title: "Occult City",
    file: "pdfs/occult_city.pdf",
    pageOffset: -1,
    defaultPage: 1,
    defaultScale: 1.25,
    defaultVisible: false,
    preload: false,
    pages: [
    { label: "TOC", page: 2 }
    ]
  },
  chase_ref: {
    order: 13,
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
    order: 14,
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
    order: 15,
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


// Pre-built reference index seeded from data/current.md.
// Keys are normalized names; update this map as your reference library grows.
window.REFERENCE_INDEX = {
  "edges": {
    "fleet-footed": {
      "label": "Fleet-Footed",
      "source": "swade/38?highlight=FLEET-FOOTED"
    },
    "arcane background (psy commando)": {
      "label": "Arcane Background (Psy Commando)",
      "source": "starbreaker_core/119?highlight=ARCANE%20BACKGROUND%20%28PSY%20COMMANDO%29"
    },
    "basic psychic loadout": {
      "label": "Basic Psychic Loadout",
      "source": "starbreaker_core/120"
    },
    "psyfocus loadout": {
      "label": "PsyFocus Loadout",
      "source": "starbreaker_core/120"
    },
    "advanced psyfocus loadout": {
      "label": "Advanced PsyFocus Loadout",
      "source": "starbreaker_core/120"
    },
    "living weapon": {
      "label": "Living Weapon",
      "source": "starbreaker_star_marines/33"
    },
    "heavy hitters squad edge": {
      "label": "Heavy Hitters Squad Edge",
      "source": "starbreaker_star_marines/40"
    }
  },
  "items": {
    "psyfocus loadout & advanced": {
      "label": "PsyFocus Loadout & Advanced",
      "source": "starbreaker_core/120"
    },
    "gatling laser": {
      "label": "Gatling Laser",
      "source": "sfc/54?highlight=Gatling%20Laser"
    },
    "blackout grenades": {
      "label": "Blackout Grenades",
      "source": "starbreaker_core/91"
    },
    "flechette grenades": {
      "label": "Flechette Grenades",
      "source": "starbreaker_core/91"
    },
    "gravity grenades": {
      "label": "Gravity Grenades",
      "source": "starbreaker_core/91"
    },
    "web grenades": {
      "label": "Web Grenades",
      "source": "starbreaker_core/91"
    },
    "star marine armor (+6*)": {
      "label": "Star Marine Armor (+6*)",
      "source": "starbreaker_star_marines/42"
    }
  },
  "powers": {
    "arcane protection": {
      "label": "Arcane Protection",
      "source": "swade/153?highlight=arcane%20protection"
    },
    "barrier": {
      "label": "Barrier",
      "source": "swade/153?highlight=Barrier"
    },
    "blast": {
      "label": "Blast",
      "source": "swade/155?highlight=Blast"
    },
    "bolt": {
      "label": "Bolt",
      "source": "swade/155?highlight=bolt"
    },
    "boost/lower trait": {
      "label": "Boost/Lower Trait",
      "source": "swade/155?highlight=Boost%2FLower%20Trait"
    },
    "invisibility": {
      "label": "Invisibility",
      "source": "swade/163?highlight=Invisibility"
    },
    "mind link": {
      "label": "Mind Link",
      "source": "swade/163?highlight=Mind%20Link"
    },
    "smite": {
      "label": "Smite",
      "source": "swade/167?highlight=Smite"
    },
    "sound / silence": {
      "label": "Sound / Silence",
      "source": "swade/167?highlight=Sound%2FSilence"
    },
    "telekinesis": {
      "label": "Telekinesis",
      "source": "swade/169?highlight=Telekinesis"
    },
    "wall walker": {
      "label": "Wall Walker",
      "source": "swade/169?highlight=Wall%20Walker"
    }
  }
};
