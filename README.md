# 🍷 Cinematic Wine Glass

This project is a scroll-driven Three.js experience featuring a physically rendered wine glass, dynamic liquid fill, engraved glass text, and cinematic camera movement.

It uses a minimal setup with native ES modules and no external animation libraries.

---

## Overview

This project provides:

- Physically based glass rendering using `MeshPhysicalMaterial`
- A dynamically generated liquid volume derived from the bowl’s interior profile
- Scroll-controlled multi-phase camera choreography
- Shader-based glass engraving with liquid-dependent reveal
- Custom easing and animation mapping logic

All animation timing and interpolation are implemented manually.

---

## Tech Stack

- Three.js (module build)
- GLTFLoader
- Custom shader modifications via `onBeforeCompile`
- ACES Filmic tone mapping
- sRGB output color space

No React, no external animation framework, no physics engine.
