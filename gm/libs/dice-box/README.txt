Dice-Box 1.1.4
MIT License; see LICENSE.

This offline copy contains the browser ES module, its local worker chunks, Ammo WASM, and default-theme assets. It has no runtime CDN dependencies.
The physical dice are configured at scale 6 (the library default is 5), making them 20% larger.
Trait, Wild Die, and ace color preferences are stored locally in the browser.
Source: https://github.com/3d-dice/dice-box


Themes
The 3D theme selector reads assets/themes/themes.json. Theme folders go directly under assets/themes. Add each folder name and display label to that JSON file; each folder must contain a Dice-Box-compatible theme.config.json and the asset files it references. The selected theme is saved in this browser. Theme assets stay local and are not loaded from a CDN.
Theme source: https://github.com/3d-dice/dice-themes contains theme assets intended for Dice-Box. Copy a compatible theme's complete folder into assets/themes, add its folder ID and display name to assets/themes/themes.json, then reload the tools. Theme format and availability depend on that community repository.
