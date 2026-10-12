Blobl.io - sound assets
=======================

Drop the audio files below into this folder with EXACTLY these names
(they are referenced verbatim by JS/audio.js - renaming any of them
breaks that effect; missing files fail silently).

Effects (one-shot clips, short):
  click.mp3       UI / tool selection
  place.mp3       building snap (impact) - placeholder "squish/thunk"
  connect.mp3     rod coupling settles (plays ~130ms after place)
  swap.mp3        buildings exchanged
  delete.mp3      building removed
  error.mp3       invalid / unaffordable placement
  pvp.mp3         space = PvP toggled on
  hit.mp3         own base took damage
  eliminated.mp3  base destroyed (game over)

Music:
  music.mp3       background loop (starts on the first click, ~35% volume)

Format notes:
  - .mp3 keeps every browser happy (use .ogg too only if you also
    keep the .mp3 - the game only requests .mp3 paths).
  - Effects: keep each under ~0.5s, 44100 Hz stereo is fine.
  - Loop must start/end cleanly on music.mp3.

Controls: M toggles all audio (badge in the leaderboard shows state).