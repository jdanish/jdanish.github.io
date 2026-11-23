# Wild Card

A small, static Savage Worlds table helper for initiative cards and trait rolls. It runs entirely in the browser and needs no build step or backend.

## Use it

Open `index.html` in a browser, add combatants, then choose **Deal cards** for a new round. Initiative is sorted by card rank (Ace high) and suit (Spades, Hearts, Diamonds, Clubs); Jokers sort ahead of all other cards. The initiative panel shows cards left in the deck. If an initiative or separate-draw Joker appears, the app asks whether to reshuffle; Yes is the default. Cards already dealt for initiative stay in play. Use the arrows beside a combatant to select the previous or next combatant in the order; the active combatant is highlighted. **+ Track** opens optional Bennie and Wound counters for that combatant. Use **↻ Card** to draw an alternative, then choose which card counts for initiative. **Shuffle** returns cards and resets the current deal. The separate **Draw a Card** panel has its own 54-card deck and shows its remaining count. Its reshuffle button starts a fresh deck and clears the displayed draws.

The Quick Roll panel supports d4–d12, 1–20 dice, an optional d6 Wild Die, exploding dice, a modifier, and an editable target number. With multiple dice, choose to sum the Trait dice or keep the highest N from N Trait dice plus an optional Wild Die. In keep-highest mode, each kept die is checked separately against the target and its success or raises are listed individually. A single Trait Die uses the higher of the Trait and Wild Die.

The **Dramatic Task** tab tracks task tokens and rounds. Start with the default challenging single-character task of four tokens in three rounds, or set custom limits for the scene. Add one token for a success and two for a success with a raise; the task completes when the target is met or expires when the final round ends. The active task is saved on the device.

Combatants and the round number are saved in local storage on that device. The table is not synced across players or browsers.

## Publish with GitHub Pages

1. Add these files to the root of a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select your branch and `/ (root)`, then save.

GitHub Pages will publish `index.html`; no package installation or build command is needed.

This is an unofficial fan-made tool and is not affiliated with Pinnacle Entertainment Group.
