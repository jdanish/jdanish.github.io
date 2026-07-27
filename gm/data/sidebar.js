// Edit this structure to add/remove collapsible sections and nested note blocks.
window.SIDEBAR_SECTIONS = [
  {
    title: "Combat",
    intro: "",
    blocks: [
      {
        html: `
        
        <a class="linkicon jump-link" href="#" data-tab="swade" data-page="90">Summary</a> (<a class="linkicon jump-link" href="#" data-tab="combat_ref" data-page="1">reference</a>) 
          <ul>
            <li><a class="linkicon jump-link" href="#" data-tab="swade" data-page="92" data-highlight="Attacks">Attack</a>
            </li>
            <ul>
              <li>
                <strong>Melee</strong>
                <ul>
                  <li> <u>To hit</u>: Fighting die + wild; Must equal or beat target's Parry
                        <ul>
                          <li>Raise(s) add 1d6 to damage roll
                          </li>
                          <li><a class="linkicon jump-link" href="#" data-tab="swade" data-page="96" data-highlight="Situational Rules">Situational Rules</a> (<a class="linkicon jump-link" href="#" data-tab="combat_ref" data-page="1">reference</a>) for ganging up, flanking, prone, etc.
                          </li>
                        </ul>
                  </li>
                  <li><u>If hit</u>: Roll Damage; Must equal or beat toughness
                        <ul>
                          <li>Raise(s) add wounds
                          </li>
                        </ul>
                    </li>
                  </ul>
                </li>
              <li>  
                <strong>Ranged</strong>
                <ul>
                  <li> <u>To hit</u>: Shooting die + wild die (-2 for medium, -4 long range); Must equal or beat 4
                        <ul>
                          <li>Raise(s) add 1d6 to damage roll
                          </li>
                          <li><a class="linkicon jump-link" href="#" data-tab="swade" data-page="96" data-highlight="Situational Rules">Situational Rules</a> (<a class="linkicon jump-link" href="#" data-tab="combat_ref" data-page="1">reference</a>) for range, cover, etc.
                          </li>
                        </ul>
                        <li>NOTE: Don't forget to roll an extra die if ROF is above 1...</li>
                  </li>
                  <li><u>If hit</u>: Roll Damage; Must equal or beat toughness
                        <ul>
                          <li>Raise(s) add wounds
                          </li>
                        </ul>
                  </li>
                </ul>
              </li>
              <li>  
                <strong>Damage...</strong>
                <ul>
                  <li><a class="linkicon jump-link" href="#" data-tab="swade" data-page="95">Soaking</a> to avoid damange</li>
                    <ul>
                      <li>Vigor check, ignore one wound per success / raise
                      </li>
                    </ul>
                  <li><a class="linkicon jump-link" href="#" data-tab="swade" data-page="93">Shaken or wounded</a>
                  </li>
                </ul>
              </li>
            </ul>
          </ul>

        `
      }
    ]
  },
  {
    title: "Other Rules",
    intro: "",
    blocks: [
      {
        html: `
          <div class="stack">
            <a class="linkicon" href="https://immaterialplane.com/apps/swdr/" target="dice">Dice Roller App</a>
            <a class="linkicon jump-link" href="#" data-tab="swade" data-page="89">Bennies</a>
            <a class="linkicon jump-link" href="#" data-tab="swade" data-page="112" data-highlight="Chases &amp; Vehicles in SWADE">Chases &amp; Vehicles</a> (<a class="linkicon jump-link" href="#" data-tab="chase_ref" data-page="1">Chase Reference</a>)
            <a class="linkicon jump-link" href="#" data-tab="swade" data-page="91" data-highlight="JOKERS">Jokers</a>
          </div>
          <div class="stack">
            <ul>
              <li><a class="linkicon jump-link" href="#" data-tab="swade" data-page="146" data-highlight="Powers">Powers</a>
              </li>
              <ul>
                <li><a class="linkicon jump-link" href="#" data-tab="swade" data-page="149" data-highlight="Trappings">Trappings</a>
                </li>
                <li><a class="linkicon jump-link" href="#" data-tab="swade" data-page="150" data-highlight="Activation">Activation</a>
                </li>
                <li><a class="linkicon jump-link" href="#" data-tab="swade" data-page="151" data-highlight="Power Modifiers">Power Modifiers</a>
                </li>
                 <li><a class="linkicon jump-link" href="#" data-tab="swade" data-page="150" data-highlight="Recharging">Recharging</a>: 5 Power Points per hour spent resting
                </li>
              </ul>
            </ul>
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
                  <tr class="link-row" tabindex="0" role="button" aria-label="Blackout Grenades" data-tab="starbreaker_core" data-page="91">
                    <td>Blackout Grenades</td>
                    <td>5/10/20</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>LBT Blast, 5 grenades</td>
                 </tr>
                 <tr class="link-row" tabindex="0" role="button" aria-label="Flechette Grenades" data-tab="starbreaker_core" data-page="91">
                    <td>Flechette Grenades</td>
                    <td>5/10/20</td>
                    <td>4</td>
                    <td>3d4</td>
                    <td></td>
                    <td></td>
                    <td>MBT Blast, 5 grenades</td>
                </tr>
                 <tr class="link-row" tabindex="0" role="button" aria-label="Gravity Grenades" data-tab="starbreaker_core" data-page="91">
                    <td>Gravity Grenades</td>
                    <td>5/10/20</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>MBT Blast, 5 grenades</td>
                  </tr>
                  <tr class="link-row" tabindex="0" role="button" aria-label="Web Grenades" data-tab="starbreaker_core" data-page="91">
                    <td>Web Grenades</td>
                    <td>5/10/20</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>MBT Blast, 5 grenades</td>
                  </tr>
                </tbody>
              </table>
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

          <details class="subsection" data-persist-key="jean-grayson-edges">
            <summary>Edges</summary>
            <div class="subsection-body">
                <ul class="note-list">
                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="swade" data-page="38" data-highlight="FLEET-FOOTED">Fleet-Footed</a>
                    <ul class="note-list">
                    <li>
                      When sneaking behind enemy lines, it’s good to go fast. You have +2 Pace and a d8 Running die.
                  </li> </ul></li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_core" data-page="119" data-highlight="ARCANE BACKGROUND (PSY COMMANDO)">Arcane Background (Psy Commando)</a>
                    <ul class="note-list">
                    <li>As a psychic warrior, your mind is a weapon. Enemy powers used against you suffer a –2 penalty to their rolls and deal 2 less damage.
                  </li></ul></li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_core" data-page="120">Basic Psychic Loadout</a>
                    <ul class="note-list">
                    <li>Even without your PsyFocus, you have the powers <em>arcane protection</em>, <em>boost/lower Trait</em> (boost only, self only), <em>smite</em> (self only), and <em>wall walker</em> (self only). You can also spend a Power Point to telepathically link up to 8 allies per the <em>mind link</em> power.
                  </li></ul></li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_core" data-page="120">PsyFocus Loadout</a>
                    <ul class="note-list">
                    <li>While wielding a PsyFocus, you have 5 additional Power Points and the powers <em>bolt</em>, <em>invisibility</em>, and <em>sound/silence</em>.
                  </li></ul></li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_core" data-page="120">Advanced PsyFocus Loadout</a>
                    <ul class="note-list">
                    <li>While wielding a PsyFocus, you have the powers <em>barrier</em>, <em>blast</em>, and <em>telekinesis</em>.
                  </li></ul></li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_star_marines" data-page="33">Living Weapon</a>
                    <ul class="note-list">
                    <li>By channeling their psychic energies through their own flesh, psy commandos can enhance their natural capabilities. Once per encounter, as a limited free action, the psy-co may spend a Power Point to gain the benefits of one Combat Edge (<a class="linkicon jump-link" href="#" data-tab="swade" data-page="59">SWADE</a>) of his Rank or less, regardless of its other Requirements, until the end of the encounter. He can’t choose an Edge he already has, or that is currently active.
                  </li></ul></li>

                  <li>
                    <a class="linkicon jump-link" href="#" data-tab="starbreaker_star_marines" data-page="40">Heavy Hitters Squad Edge</a>
                    <ul class="note-list">
                    <li>The squad is equipped with experimental weapons that occasionally punch well above their weight class. When a squad member makes an attack with a firearm, he can spend a Benny to declare that it’s a “heavy” attack. If the attack hits, it has +4 AP and deals Heavy Damage.
                  </li></ul></li>
                </ul>
            </div>
          </details>

          <details class="subsection" data-persist-key="jean-grayson-powers">
            <summary>Powers</summary>
            <div class="subsection-body">
                <ul class="note-list">

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="153" data-highlight="arcane protection">Arcane Protection</a>
                  <ul>
                    <li><u>Power Points:</u> 1</li>
                    <li><u>Range:</u> Smarts</li>
                    <li><u>Duration:</u> 5</li>
                    <li><u>Description:</u> Success with arcane protection means hostile powers suffer a −2 penalty (−4 with a raise) to affect this character. If the hostile power fails due to this penalty, it still activates and expends its Power Points. Harmful powers that do affect the target deal 2 less damage (4 less with a raise). Arcane Protection stacks with Arcane Resistance.</li>
                    <li>
                      <u>Modifiers:</u>
                      <ul>
                        <li><strong>Additional Recipients (+1):</strong> Affect one additional target per Power Point spent.</li>
                      </ul>
                    </li>
                  </ul>
                </li>

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="153" data-highlight="Barrier">Barrier</a>
                  <ul>
                    <li><u>Power Points:</u> 2</li>
                    <li><u>Range:</u> Smarts</li>
                    <li><u>Duration:</u> 5</li>
                    <li><u>Description:</u> Creates a straight wall 5" long and 1" tall. The barrier has Hardness 10 (12 with a raise) and disappears when destroyed or when the power ends.</li>
                    <li>
                      <u>Modifiers:</u>
                      <ul>
                        <li><strong>Damage (+1):</strong> Touching the barrier causes 2d4 damage.</li>
                        <li><strong>Hardened (+1):</strong> Hardness becomes 12 (14 with a raise).</li>
                        <li><strong>Shaped (+2):</strong> Form the barrier into a circle, square, or other simple shape.</li>
                        <li><strong>Size (+1):</strong> Double the barrier's length and height.</li>
                      </ul>
                    </li>
                  </ul>
                </li>

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="155" data-highlight="Blast">Blast</a>
                  <ul>
                    <li><u>Power Points:</u> 3</li>
                    <li><u>Range:</u> Smarts ×2</li>
                    <li><u>Duration:</u> Instant</li>
                    <li><u>Description:</u> Launches an explosive burst affecting a Medium Blast Template. Targets suffer 2d6 damage (3d6 with a raise).</li>
                    <li>
                      <u>Modifiers:</u>
                      <ul>
                        <li><strong>Area Effect (+0/+1):</strong> Use a Small Blast Template for no additional cost or a Large Blast Template for +1 Power Point.</li>
                        <li><strong>Damage (+2):</strong> Damage becomes 3d6 (4d6 with a raise).</li>
                      </ul>
                    </li>
                  </ul>
                </li>

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="155" data-highlight="bolt">Bolt</a>
                  <ul>
                    <li><u>Power Points:</u> 1</li>
                    <li><u>Range:</u> Smarts ×2</li>
                    <li><u>Duration:</u> Instant</li>
                    <li><u>Description:</u> Bolt sends damaging bursts of energy toward one or more foes. It ignores Range penalties but is affected by Cover, Illumination, and all other usual penalties. Damage is 2d6 (3d6 with a raise).</li>
                    <li>
                      <u>Modifiers:</u>
                      <ul>
                        <li><strong>Damage (+2):</strong> Damage becomes 3d6 (4d6 with a raise).</li>
                      </ul>
                    </li>
                  </ul>
                </li>

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="155" data-highlight="Boost/Lower Trait">Boost/Lower Trait</a> (boost only, self only)
                  <ul>
                    <li><u>Power Points:</u> 1</li>
                    <li><u>Range:</u> Smarts</li>
                    <li><u>Duration:</u> 5</li>
                    <li><u>Description:</u> Increases one of the caster's Traits. Additional castings don't stack on the same Trait, but may affect different Traits.</li>
                  </ul>
                </li>

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="163" data-highlight="Invisibility">Invisibility (self only)</a>
                  <ul>
                    <li><u>Power Points:</u> 1</li>
                    <li><u>Range:</u> Smarts</li>
                    <li><u>Duration:</u> 5</li>
                    <li><u>Description:</u> The target and carried items become nearly invisible. Attacks and Notice rolls relying on sight suffer −4 (−6 with a raise).</li>
                  </ul>
                </li>

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="163" data-highlight="Mind Link">Mind Link</a>
                  <ul>
                    <li><u>Power Points:</u> 1</li>
                    <li><u>Range:</u> Smarts</li>
                    <li><u>Duration:</u> 30 minutes</li>
                    <li><u>Description:</u> Creates a telepathic connection between willing individuals within one mile (five miles with a raise). If one linked character suffers a Wound, the others must make a Smarts roll or become Shaken. With a raise, communication is nearly instantaneous.</li>
                    <li>
                      <u>Modifiers:</u>
                      <ul>
                        <li><strong>Additional Recipients (+1):</strong> Affect one additional willing target per additional Power Point.</li>
                      </ul>
                    </li>
                  </ul>
                </li>

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="167" data-highlight="Smite">Smite</a> (self only)
                  <ul>
                    <li><u>Power Points:</u> 1</li>
                    <li><u>Range:</u> Smarts</li>
                    <li><u>Duration:</u> 5</li>
                    <li><u>Description:</u> Enhances one weapon or one full load of ammunition. Damage increases by +2 (+4 with a raise).</li>
                  </ul>
                </li>

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="167" data-highlight="Sound/Silence">Sound / Silence</a>
                  <ul>
                    <li><u>Power Points:</u> 1</li>
                    <li><u>Range:</u> Smarts ×5 (Sound); Smarts (Silence)</li>
                    <li><u>Duration:</u> Instant (Sound); 5 (Silence)</li>
                    <li><u>Description:</u> Sound creates convincing noises or voices. Silence suppresses sound within a Large Blast Template, reducing Notice rolls by 4. With a raise, all sound inside the template is completely muted.</li>
                    <li>
                      <u>Modifiers:</u>
                      <ul>
                        <li><strong>Mobile (+1):</strong> Move the area of effect each round.</li>
                        <li><strong>Targeted (+0):</strong> Affect individual targets instead of an area.</li>
                      </ul>
                    </li>
                  </ul>
                </li>

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="169" data-highlight="Telekinesis">Telekinesis</a>
                  <ul>
                    <li><u>Power Points:</u> 5</li>
                    <li><u>Range:</u> Smarts</li>
                    <li><u>Duration:</u> 5</li>
                    <li><u>Description:</u> Move objects or creatures using arcane force with Strength d10 (d12 with a raise). Unwilling targets resist with Spirit.</li>
                    <li>
                      <u>Uses:</u>
                      <ul>
                        <li><strong>Bash:</strong> Slam the target into a surface for Str+d6 damage.</li>
                        <li><strong>Change Targets:</strong> Release one target and acquire another.</li>
                        <li><strong>Manipulate:</strong> Operate tools or wield weapons using the caster's arcane skill.</li>
                        <li><strong>Move:</strong> Move the target up to the caster's Smarts each round as a limited free action.</li>
                      </ul>
                    </li>
                  </ul>
                </li>

                <li>
                  <a class="linkicon jump-link" href="#" data-tab="swade" data-page="169" data-highlight="Wall Walker">Wall Walker</a> (self only)
                  <ul>
                    <li><u>Power Points:</u> 1</li>
                    <li><u>Range:</u> Smarts</li>
                    <li><u>Duration:</u> 5</li>
                    <li><u>Description:</u> Walk on vertical or horizontal surfaces. Success allows movement at half Pace; a raise allows full Pace and running. Gain +4 to Athletics rolls made to cling to a surface.</li>
                  </ul>
                </li>

              </ul>


          </div>
          </details>
        `
      }
    ]
  }
];
