# Pill Gallery

Camera moves blocked out in grey 3D, and what an AI video model made from each one.

Every person in these previews is a **striped pill**: a tall rounded capsule, as tall as the person, with loud diagonal stripes and a white dot at eye height on the side it faces. Every product is a pill too. A pill gives a video model the place, the size, the facing and the timing of a person with nothing to copy: no body, no pose, no stiff mannequin walk. The prompt says what everything really is.

Open `index.html` in a browser. There is nothing to install and nothing to build. The top of the page shows one move at three stages side by side: the 3D scene, the pills, and what the model made.

## What is in it

| Family | Moves | What it is |
|---|---|---|
| Camera moves on people | 16 | Locked-off, pan, push in, crane, orbit, steadicam, whip pan, handheld, FPV and more |
| Camera moves on objects | 16 | Orbit, flyby, top-down, rack focus, through a doorway, macro slider, product spin and more |
| Action | 8 | Bullet-time orbit, snorricam, crash zoom, sprint dolly zoom, parkour, fall |
| One-take shots | 4 | Whole sequences in one unbroken camera move |
| Scenes | 10 | Forest, dialogue, street walk and talk, car interior, rooftop chase, heist, standoff, car crash |
| Famous shots | 6 | 360 booth, walk away from the explosion, trunk shot, leap of faith, Bay 360, Peter Pan flight |
| Product shots | 4 | Robot-arm snap, probe fly-through, skyline dive, red-carpet glambot (the exploded build is not included) |
| Showcase film | 1 | The Handoff: a 30 second, ten-shot scene planned as pills and drawn as a storyboard |
| Camera only | 3 | A camera move in grey 3D with no people, and what the model made from it |
| Sketches | 4 moves, 15 more | The same move drawn five ways (pills, pencil, ink, ghosts, empty plate), with the contact sheet we sent and what each made |

Each card has the pill clip (the reference), an AI example made from it where there is one, the notes (what it says, what to use it for, the camera numbers, what to avoid) and the full prompt with a copy button.

## How it is made

Each move is a small TypeScript file that describes a set, some people and a camera. It is rendered with three.js (through React Three Fiber) inside Remotion, frame by frame in headless Chrome, at 24 fps with a 180 degree shutter and a 2.39:1 frame. Every frame goes through one post chain: ambient occlusion, a thin-lens depth of field worked out from the lens, stop and focus distance, bloom, motion blur, a filmic tone map and grain. People are an animated mannequin rig (about 80 captured clips, sampled so feet never slide) that is swapped for a striped pill fitted to the body; crates, debris and cars use physics baked once with Rapier, so every render is identical. The same scene can also be drawn as an ink storyboard, pencil on the figures, soft ghosts or an empty plate. Camera numbers come from the camera that renders the frame, and a measured pass checks each clip for sliding feet and bodies that pass through each other. The renderer's source is not in this folder.

## How to use a move

1. Download the pill clip from a card.
2. Send it to a video model as the **reference video**, with a photo of your own person or product as the **reference image**.
3. Use the prompt from the card. Keep the sentences that say what the pills are, and the sentences that say to rebuild the set. Change the rest.

The prompts were written for Seedance 2.5 in multi-reference mode. The method (pills for people, a grey layout for the set, a prompt that names everything) is not specific to one model.

Things that mattered most:

- **Name every stand-in.** Say which pill is which person, what the grey objects really are, and that no pill ever appears in the result.
- **Rebuild the set in words.** Without it the model copies the grey cones, boxes and spheres. Describe each object as a real thing with real materials.
- **Hold every cut for two seconds or more.** The model keeps cut timing to the frame when the clip does.
- **Give a conversation real lines.** A scene with two people talking needs spoken lines in the prompt, or the mouths stay shut.

## Folder

```
index.html     the gallery, one page, no dependencies
data.js        every card: notes, prompt, file names
data.json      the same data as plain JSON
media/<id>/    pill.mp4, pill.jpg, result.mp4, sketch-result.mp4
media/looks/   the drawn looks
```

## Add a move

Add a folder `media/<ID>/` with `pill.mp4`, `pill.jpg` and, if you have one, `result.mp4`, then add an entry to `data.json` and `data.js`. Pill clips are 24 fps, 2.39:1, with no sound.

## About the examples

- The AI examples are **480p drafts**, shown to compare against the pills, not as finished films.
- Some examples show real products and brand marks (a sneaker, a soda can, a tumbler). They are only there to show what a model can do from a pill. The marks belong to their owners and are not covered by the licence below.
- Some examples show the face of the person who made them.

## Licence

Code, page, notes and prompts: MIT (see `LICENSE`). The clips are shared under the same terms, except for third-party marks and products shown in the product shots.

## Credits

Made by Sirio Berati. Pill clips rendered with three.js. Examples made with Seedance 2.5.
