# Combat

[[swade/90|Summary]] ([[combat_ref/1|reference]])

- [[swade/92?highlight=Attacks|Attack]]
  - **Melee**
    - *To hit:* Fighting die + wild; must equal or beat the target's Parry.
      - Raise(s) add 1d6 to the damage roll.
      - [[swade/96?highlight=Situational%20Rules|Situational Rules]] ([[combat_ref/1|reference]]) for ganging up, flanking, prone, etc.
    - *If hit:* Roll damage; must equal or beat toughness.
      - Raise(s) add wounds.
  - **Ranged**
    - *To hit:* Shooting die + wild die (-2 for medium, -4 long range); must equal or beat 4.
      - Raise(s) add 1d6 to the damage roll.
      - [[swade/96?highlight=Situational%20Rules|Situational Rules]] ([[combat_ref/1|reference]]) for [[swade/92?highlight=ranGe+PenaLtieS|range penalties]], [[swade/98?highlight=Cover+%26+Obstacles|cover & obstacles]], etc.
    - *Note:* Don't forget to roll an extra die if ROF is above 1.
    - *If hit:* Roll damage; must equal or beat toughness.
      - Raise(s) add wounds.
  - **Damage**
    - [[swade/95|Soaking]] to avoid damage.
      - Vigor check; ignore one wound per success or raise.
    - [[swade/93|Shaken or wounded]] (can't act if shaken, -1 to trait dice and pace)
    - [[swade/99?highlight=Fatigue|Fatigue]]

# Other Rules

- [Dice Roller App](https://immaterialplane.com/apps/swdr/)
- [[swade/89|Bennies]]
		1. 		Reroll trait
		2. 		Recover from shaken
		3. 		[[swade/95?highlight=Soak+Rolls|Soak Rolls]]
		4. 		Draw a new action card
		5. 		Reroll damage
		6. 		Regain power points
		7. 		Influence the story
- [[swade/112?highlight=Chases%20%26%20Vehicles%20in%20SWADE|Chases & Vehicles]] ([[chase_ref/1|Chase Reference]])
- [[swade/91?highlight=JOKERS|Jokers]]
		1. 	Side gains Bennies ([[swade/88?highlight=JOKER%E2%80%99S+WILD|JOKER’S WILD]])
		2. 	Player who drew it can hold and go whenever, interrupting
		3. 	Individual or group gets +2 to trait and damage rolls this turn
		4. 	Reshuffle
- [[swade/146?highlight=Powers|Powers]]
  - [[swade/149?highlight=Trappings|Trappings]]
  - [[swade/150?highlight=Activation|Activation]]
  - [[swade/151?highlight=Power%20Modifiers|Power Modifiers]] (Armor piercing, fatigue, glow/shroud, heavy weapon, hinder/hurry, lingering damage, range, selective)
  - [[swade/150?highlight=Recharging|Recharging]]: 5 Power Points per hour spent resting
- [[swade/99?highlight=Fatigue|Fatigue]]
		1. 	FATIGUED: The victim subtracts 1 from all Trait rolls. One more Fatigue -> Exhausted.
		2. 	EXHAUSTED: The victim subtracts 2 from all Trait rolls. One more Fatigue -> Incapacitated.
		3. 	INCAPACITATED: The victim cannot perform actions and may be unconscious (GM’s call).
- [[swade/123?highlight=Fear|Fear / Terror]]
	- The heroes make a Fear check (a Spirit roll as a free action) when they first spot a creature with the Fear ability.

- [[swade/121?highlight=Dramatic+Tasks|Dramatic Tasks]]

# Movement

[[swade/9?highlight=Pace|Pace]] is how fast your character moves in tactical situations like combat. Standard Pace is 6, which means six tabletop inches per game round. **Each inch is two yards ** in the real world.

[[swade/91?highlight=Movement|Movement]] In addition to their actions, characters can move a number of tabletop inches equal to their Pace each turn.

Each inch of movement spent climbing, crawling, or swimming uses 2″ of Pace.

**Running**: A hero can choose to “run”, increasing her Pace for the round by her Running die (a d6 by default) at the cost of a −2 penalty to all other actions that turn. Running dice never Ace.

# My motivations for this tool

This tool is intended to help me as both a player and GM of Savage Worlds games. In particular, I find I enjoy looking at / through the books and want to rely upon them. Therefore, the challenge is in tracking all of the books I have, and all of the information that might be relevant in them in one place. I decided to handle that by building an app that holds all the pdfs inside of it, and allows me to keep notes about the rules, current game, and specific characters in an environment where I can quickly and easily link to the spots in the books that describe them in detail. I hope to continue making it robust in this kind of usage to match how I like to read, learn, and play.

I appreciate character builders like savaged.us or dicey.cc nad so want this to work with them by importing data. However, they already handle validation which is a huge task I don't want to mess with. I prefer rolling dice physically, and so have a link to a tool if I ever don't have my dice handy, but otherwise don't need / want to integrate it further since I'd rather use those nice dice I bought. Other tools handle maps, initiative, and other tracking. I might decide to integrate some of that better, but I like that those other tools also share that information over the web. I am still considering it, though. For now I handle player-level tracking and assume other players handle their own, but will reconsider. I want to focus primarily on things I like that are not already being built by others.