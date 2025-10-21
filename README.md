
# gom jabbar

lightweight web tool for inspecting 3d model rigging, skeletons, blendshapes, & animation clips. built with three.js. zero build step. open in browser, drag in a model, & it just works.

---

## what it does

- loads `.glb`, `.gltf`, `.fbx`, `.obj` files (plus linked textures)
- parses meshes, bones, & blendshape data
- shows vertex weighting stats & skinning coverage
- previews blendshapes with live sliders
- plays animation clips with speed + loop controls
- displays bone hierarchy textually for quick sanity checks
- runs fully offline after first load (browser cache)

---

## usage

1. open `viewer.html` in any modern browser  
2. drag in a `.glb`, `.gltf`, `.fbx`, or `.obj` file  
   or paste a url that allows **cors**  
3. rotate, pan, zoom — the usual orbit controls  
4. explore skeleton, morphs, & animations in the right panel

---

## mobile

- responsive layout: viewer on top, panel below  
- works on touch for orbit / zoom  
- sliders & buttons are touch-friendly

---

## tech stack

- **three.js** `r165`
- `gltfloader`, `dracoloader`, `ktx2loader`, `fbxloader`, `objloader`
- no frameworks, no bundlers  
- pure html + js modules

---

## design notes

- everything in lowercase. clean, minimal ui.  
- viewer takes full available space; panel docks right or below depending on screen size.  
- internal url manager allows drag-&-drop multi-file `.gltf` with external buffers/textures.  
- revokes objecturls & disposes resources to stay memory-safe.

---

## lore

> “the gom jabbar slices through mesh without a blade.  
> it sees bones before they move.  
> it sees faces before they’re ever made.”  
> — paulmaah i (padishah emperor of the known universe)

---

## license

do whatever. give credit to the padishah emperor.
