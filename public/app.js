      const app = document.getElementById("app");
      const veil = document.getElementById("cinematic-veil");
      const revealCopy = document.getElementById("reveal-copy");
      const revealLines = Array.from(document.querySelectorAll("#reveal-copy .line"));
      const logoIntro = document.getElementById("logo-intro");
      const logoIntroImg = document.getElementById("logo-intro-img");
      const endTextImage = document.getElementById("end-text-image");
      const endQrImage = document.getElementById("end-qr-image");
      function showFatalError(message) {
        const box = document.createElement("div");
        box.style.position = "fixed";
        box.style.left = "50%";
        box.style.top = "24px";
        box.style.transform = "translateX(-50%)";
        box.style.zIndex = "100";
        box.style.padding = "10px 14px";
        box.style.background = "rgba(0, 0, 0, 0.72)";
        box.style.color = "#f9d6d9";
        box.style.font = "500 14px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
        box.style.border = "1px solid rgba(230, 156, 165, 0.45)";
        box.style.borderRadius = "10px";
        box.textContent = message;
        document.body.appendChild(box);
      }

      function createRenderer(THREE) {
        const attempts = [
          { antialias: true, alpha: true, powerPreference: "high-performance" },
          { antialias: false, alpha: true, powerPreference: "default" },
          { antialias: false, alpha: false, powerPreference: "default" },
        ];

        for (const options of attempts) {
          try {
            return new THREE.WebGLRenderer(options);
          } catch (err) {
            console.warn("Renderer init attempt failed:", options, err);
          }
        }

        const canvas = document.createElement("canvas");
        const contextAttributes = {
          antialias: false,
          alpha: true,
          depth: true,
          stencil: false,
          powerPreference: "default",
        };

        const context =
          canvas.getContext("webgl2", contextAttributes) ||
          canvas.getContext("webgl", contextAttributes) ||
          canvas.getContext("experimental-webgl", contextAttributes);

        if (context) {
          try {
            return new THREE.WebGLRenderer({ canvas, context, antialias: false, alpha: true });
          } catch (err) {
            console.warn("Renderer init with explicit context failed:", err);
          }
        }

        throw new Error("WebGLUnavailable");
      }

      async function init() {
        try {
          await playLogoIntro();

          if (window.location.protocol === "file:") {
            showFatalError("Model loading is blocked over file://. Start a local server and open http://localhost.");
          }

          const THREE = await import("./vendor/three.module.js");
          const { GLTFLoader } = await import("./vendor/GLTFLoader.js");

          const renderer = createRenderer(THREE);
          renderer.setSize(window.innerWidth, window.innerHeight);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.localClippingEnabled = true;
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.5;
          renderer.setClearColor(0x000000, 0);
          app.appendChild(renderer.domElement);

          const scene = new THREE.Scene();

          const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
          camera.position.set(0.1, 1.1, 3.25);
          camera.lookAt(0.08, 0.02, 0.06);

          const ambient = new THREE.AmbientLight(0xffffff, 0);
          scene.add(ambient);
          const hemi = new THREE.HemisphereLight(0xe8efff, 0x2b0e16, 0);
          hemi.position.set(0, 2, 0);
          scene.add(hemi);
          const key = new THREE.DirectionalLight(0xffffff, 0);
          key.position.set(2.5, 3.5, 2);
          scene.add(key);
          const rim = new THREE.DirectionalLight(0xbcd8f0, 0);
          rim.position.set(-2.3, 2.2, -3);
          scene.add(rim);
          const fill = new THREE.PointLight(0xfff4f4, 0, 10);
          fill.position.set(0.15, 1.1, 1.2);
          scene.add(fill);

          const loader = new GLTFLoader();
          const modelBaseUrl = new URL("./", import.meta.url);
          const modelUrl = new URL("./wine_glass.glb", modelBaseUrl).href;
          let wine = null;
          let intro = null;
          let scrollTarget = 0;
          let scrollCurrent = 0;
          let wheelProgress = 0;
          let scrollRig = null;
          const DEBUG_INNER_VOLUME = false;
          const DEBUG_LIQUID_WIREFRAME = false;
          const DEBUG_LIQUID_BOUNDS = false;
          const LIQUID_FILL_RATIO = 0.54;
          const LIQUID_CLEARANCE_SCALE = 0.96;
          let liquidPivot = null;
          let innerVolumeDebug = null;
          let innerGlassWireDebug = null;
          let liquidWireDebug = null;
          let bowlBoundsHelper = null;
          let wineBoundsHelper = null;
          let bowlBoundsBox = null;
          let wineBoundsBox = null;
          let liquidVolume = null;
          let liquidSurface = null;
          let liquidMeniscus = null;
          let liquidRig = null;
          let frontEngraving = null;
          let companionGlass = null;
          let companionLiquidPivot = null;
          let companionLiquidVolume = null;
          let companionLiquidSurface = null;
          let clinkTick = null;
          let clinkTickRing = null;
          let clinkTickCore = null;
          let finalTurnProgress = 0;
          let endTurnReachedAt = null;
          const WHEEL_SCROLL_SENSITIVITY = 0.00045;
          const HOLD_START_RAW = 0.5;
          const HOLD_END_RAW = 0.88;
          const TURN_START_RAW = 0.74;
          const HOLD_MAPPED_T = 0.94;
          const etchedGlassUniforms = [];
          const lookTarget = new THREE.Vector3();
          const liquidWorldUp = new THREE.Vector3();
          const liquidLocalNormal = new THREE.Vector3();
          const liquidParentQ = new THREE.Quaternion();
          const liquidParentQInv = new THREE.Quaternion();
          const liquidSurfaceWorldQ = new THREE.Quaternion();
          const companionLiquidLocalNormal = new THREE.Vector3();
          const companionLiquidParentQ = new THREE.Quaternion();
          const companionLiquidParentQInv = new THREE.Quaternion();

          function easeInOutCubic(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          }

          function easeOutBack(t) {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
          }

          function easeOutExpo(t) {
            return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          }

          function easeOutCubic(t) {
            return 1 - Math.pow(1 - t, 3);
          }

          function mapScrollProgressWithHold(rawT, THREE) {
            const t = THREE.MathUtils.clamp(rawT, 0, 1);
            if (t <= HOLD_START_RAW) {
              return THREE.MathUtils.lerp(0, HOLD_MAPPED_T, t / Math.max(HOLD_START_RAW, 1e-6));
            }
            if (t <= HOLD_END_RAW) {
              return HOLD_MAPPED_T;
            }
            return THREE.MathUtils.lerp(HOLD_MAPPED_T, 1, (t - HOLD_END_RAW) / Math.max(1 - HOLD_END_RAW, 1e-6));
          }

          function createEtchMaskTexture(THREE, text) {
            const canvas = document.createElement("canvas");
            canvas.width = 1024;
            canvas.height = 512;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "700 238px Baskerville, Times New Roman, serif";
            ctx.fillStyle = "white";
            ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.54);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = false;
            tex.needsUpdate = true;
            return tex;
          }

          function createFrontEngravingTexture(THREE, text) {
            const canvas = document.createElement("canvas");
            canvas.width = 1024;
            canvas.height = 360;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "700 140px 'Diphylleia', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', serif";
            ctx.fillStyle = "white";
            const lines = String(text).split("\n");
            const lineHeight = 170;
            const startY = canvas.height * 0.5 - ((lines.length - 1) * lineHeight) / 2;
            for (let i = 0; i < lines.length; i += 1) {
              ctx.fillText(lines[i], canvas.width * 0.5, startY + i * lineHeight);
            }
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = false;
            tex.needsUpdate = true;
            return tex;
          }

          function applyEngravingToGlassMesh(THREE, mesh, options) {
            if (!mesh || !mesh.material || !mesh.material.isMeshPhysicalMaterial) return;
            const baseMaterial = mesh.material;
            const etchedMaterial = baseMaterial.clone();
            etchedMaterial.userData = etchedMaterial.userData || {};
            const uniforms = {
              uEngraveMask: { value: options.maskTexture },
              uTexelSize: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
              uCenterX: { value: options.centerX },
              uCenterZ: { value: options.centerZ },
              uFacingAngle: { value: options.facingAngle },
              uAngleHalf: { value: options.angleHalf },
              uYMin: { value: options.yMin },
              uYMax: { value: options.yMax },
              uEtchDepth: { value: options.depth },
              uEtchNormalStrength: { value: options.normalStrength },
              uEtchRoughnessBoost: { value: options.roughnessBoost },
              uFillY: { value: options.initialFillY },
            };
            etchedMaterial.userData.etchUniforms = uniforms;
            etchedGlassUniforms.push(uniforms);
            etchedMaterial.onBeforeCompile = (shader) => {
              shader.uniforms.uEngraveMask = uniforms.uEngraveMask;
              shader.uniforms.uTexelSize = uniforms.uTexelSize;
              shader.uniforms.uCenterX = uniforms.uCenterX;
              shader.uniforms.uCenterZ = uniforms.uCenterZ;
              shader.uniforms.uFacingAngle = uniforms.uFacingAngle;
              shader.uniforms.uAngleHalf = uniforms.uAngleHalf;
              shader.uniforms.uYMin = uniforms.uYMin;
              shader.uniforms.uYMax = uniforms.uYMax;
              shader.uniforms.uEtchDepth = uniforms.uEtchDepth;
              shader.uniforms.uEtchNormalStrength = uniforms.uEtchNormalStrength;
              shader.uniforms.uEtchRoughnessBoost = uniforms.uEtchRoughnessBoost;
              shader.uniforms.uFillY = uniforms.uFillY;

              shader.vertexShader = shader.vertexShader
                .replace(
                  "#include <common>",
                  `#include <common>
uniform sampler2D uEngraveMask;
uniform float uCenterX;
uniform float uCenterZ;
uniform float uFacingAngle;
uniform float uAngleHalf;
uniform float uYMin;
uniform float uYMax;
uniform float uEtchDepth;
varying vec3 vLocalPos;
varying vec2 vEtchUv;
varying float vEtchGate;`
                )
                .replace(
                  "#include <begin_vertex>",
                  `#include <begin_vertex>
vLocalPos = position;
vec3 etchRel = vec3(position.x - uCenterX, position.y, position.z - uCenterZ);
float etchAngle = atan(etchRel.z, etchRel.x);
float etchDelta = atan(sin(etchAngle - uFacingAngle), cos(etchAngle - uFacingAngle));
float etchU = 0.5 + etchDelta / max(uAngleHalf * 2.0, 0.0001);
float etchV = (position.y - uYMin) / max(uYMax - uYMin, 0.0001);
vEtchGate = step(0.0, etchU) * step(etchU, 1.0) * step(0.0, etchV) * step(etchV, 1.0);
vEtchUv = vec2(clamp(etchU, 0.0, 1.0), clamp(etchV, 0.0, 1.0));
float etchMask = texture2D(uEngraveMask, vEtchUv).r * vEtchGate;
transformed -= normalize(objectNormal) * (etchMask * uEtchDepth);`
                );

              shader.fragmentShader = shader.fragmentShader
                .replace(
                  "#include <common>",
                  `#include <common>
uniform sampler2D uEngraveMask;
uniform vec2 uTexelSize;
uniform float uEtchNormalStrength;
uniform float uEtchRoughnessBoost;
uniform float uFillY;
varying vec3 vLocalPos;
varying vec2 vEtchUv;
varying float vEtchGate;
float etchedRevealFactor() {
  float etchMask = texture2D(uEngraveMask, vEtchUv).r * vEtchGate;
  float reveal = smoothstep(vLocalPos.y - 0.02, vLocalPos.y + 0.05, uFillY);
  return etchMask * mix(0.16, 1.0, reveal);
}`
                )
                .replace(
                  "#include <normal_fragment_maps>",
                  `#include <normal_fragment_maps>
float etchReveal = etchedRevealFactor();
float etchSamplePx = texture2D(uEngraveMask, vEtchUv + vec2(uTexelSize.x, 0.0)).r - texture2D(uEngraveMask, vEtchUv - vec2(uTexelSize.x, 0.0)).r;
float etchSamplePy = texture2D(uEngraveMask, vEtchUv + vec2(0.0, uTexelSize.y)).r - texture2D(uEngraveMask, vEtchUv - vec2(0.0, uTexelSize.y)).r;
normal = normalize(normal + vec3(-etchSamplePx, 0.0, -etchSamplePy) * (uEtchNormalStrength * etchReveal));`
                )
                .replace(
                  "float roughnessFactor = roughness;",
                  "float roughnessFactor = clamp(roughness + etchedRevealFactor() * uEtchRoughnessBoost, 0.0, 1.0);"
                );
            };
            etchedMaterial.customProgramCacheKey = () => "etched-glass-v2";
            mesh.material = etchedMaterial;
            mesh.material.needsUpdate = true;
          }

          function createClippedWineMaterial(THREE, config) {
            const mat = new THREE.MeshPhysicalMaterial({
              color: config.color,
              roughness: config.roughness,
              metalness: 0,
              transmission: config.transmission,
              thickness: config.thickness,
              ior: config.ior,
              transparent: true,
              opacity: config.opacity,
              clearcoat: config.clearcoat,
              clearcoatRoughness: config.clearcoatRoughness,
              attenuationColor: new THREE.Color(config.attenuationColor),
              attenuationDistance: config.attenuationDistance,
              side: THREE.DoubleSide,
              depthWrite: false,
            });

            mat.userData.liquidUniforms = {
              uFillHeight: { value: 0 },
              uFillNormal: { value: new THREE.Vector3(0, 1, 0) },
              uEdgeSoftness: { value: 0.01 },
            };

            mat.onBeforeCompile = (shader) => {
              shader.uniforms.uFillHeight = mat.userData.liquidUniforms.uFillHeight;
              shader.uniforms.uFillNormal = mat.userData.liquidUniforms.uFillNormal;
              shader.uniforms.uEdgeSoftness = mat.userData.liquidUniforms.uEdgeSoftness;

              shader.vertexShader = shader.vertexShader
                .replace("#include <common>", "#include <common>\nvarying vec3 vLocalPos;")
                .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocalPos = position;");

              shader.fragmentShader = shader.fragmentShader
                .replace(
                  "#include <common>",
                  "#include <common>\nvarying vec3 vLocalPos;\nuniform float uFillHeight;\nuniform vec3 uFillNormal;\nuniform float uEdgeSoftness;"
                )
                .replace(
                  "#include <dithering_fragment>",
                  "float fillCut = dot(vLocalPos, normalize(uFillNormal)) - uFillHeight;\nif (fillCut > uEdgeSoftness) discard;\n#include <dithering_fragment>"
                );
            };

            return mat;
          }

          function buildInnerBowlProfile(root, THREE) {
            const bowlMeshes = selectBowlMeshes(root, THREE);
            if (!bowlMeshes.length) return null;

            root.updateMatrixWorld(true);
            const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
            const tmp = new THREE.Vector3();
            const local = new THREE.Vector3();
            const pts = [];
            const bowlBounds = new THREE.Box3();
            const meshBounds = new THREE.Box3();
            let initializedBounds = false;

            for (const obj of bowlMeshes) {
              if (!obj.geometry || !obj.geometry.attributes || !obj.geometry.attributes.position) continue;
              obj.updateMatrixWorld(true);
              meshBounds.setFromObject(obj);
              if (!initializedBounds) {
                bowlBounds.copy(meshBounds);
                initializedBounds = true;
              } else {
                bowlBounds.union(meshBounds);
              }
              const pos = obj.geometry.attributes.position;
              for (let i = 0; i < pos.count; i += 1) {
                tmp.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
                local.copy(tmp).applyMatrix4(invRoot);
                const r = Math.hypot(local.x, local.z);
                pts.push({ x: local.x, y: local.y, z: local.z, r });
              }
            }

            if (!pts.length) {
              return null;
            }

            let rMax = 0;
            for (const p of pts) rMax = Math.max(rMax, p.r);
            const bowlCandidates = pts.filter((p) => p.r > rMax * 0.22);
            if (bowlCandidates.length < 30) {
              return null;
            }

            let yMin = Infinity;
            let yMax = -Infinity;
            let xAcc = 0;
            let zAcc = 0;
            for (const p of bowlCandidates) {
              yMin = Math.min(yMin, p.y);
              yMax = Math.max(yMax, p.y);
              xAcc += p.x;
              zAcc += p.z;
            }
            const centerX = xAcc / bowlCandidates.length;
            const centerZ = zAcc / bowlCandidates.length;
            const centeredRadii = bowlCandidates.map((p) => ({
              y: p.y,
              r: Math.hypot(p.x - centerX, p.z - centerZ),
            }));
            let centeredMax = 0;
            for (const p of centeredRadii) centeredMax = Math.max(centeredMax, p.r);
            const bowlBand = centeredRadii.filter((p) => p.r > centeredMax * 0.38);
            const bandSource = bowlBand.length > 24 ? bowlBand : centeredRadii;

            yMin = Infinity;
            yMax = -Infinity;
            for (const p of bandSource) {
              yMin = Math.min(yMin, p.y);
              yMax = Math.max(yMax, p.y);
            }

            const bowlBottomY = yMin + (yMax - yMin) * 0.12;
            const bowlTopY = yMin + (yMax - yMin) * 0.91;
            const bowlHeight = Math.max(bowlTopY - bowlBottomY, 0.25);
            const bins = 68;
            const halfBin = (bowlHeight / bins) * 1.15;
            const rawRadii = new Array(bins + 1).fill(0);

            const sliceTriangles = [];
            const vA = new THREE.Vector3();
            const vB = new THREE.Vector3();
            const vC = new THREE.Vector3();
            const toRoot = new THREE.Matrix4();
            for (const obj of bowlMeshes) {
              if (!obj.geometry || !obj.geometry.attributes || !obj.geometry.attributes.position) continue;
              const pos = obj.geometry.attributes.position;
              const index = obj.geometry.index;
              const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
              toRoot.copy(invRoot).multiply(obj.matrixWorld);
              for (let t = 0; t < triCount; t += 1) {
                const i0 = index ? index.getX(t * 3) : t * 3;
                const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
                const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
                vA.fromBufferAttribute(pos, i0).applyMatrix4(toRoot);
                vB.fromBufferAttribute(pos, i1).applyMatrix4(toRoot);
                vC.fromBufferAttribute(pos, i2).applyMatrix4(toRoot);
                const triYMin = Math.min(vA.y, vB.y, vC.y);
                const triYMax = Math.max(vA.y, vB.y, vC.y);
                if (triYMax < bowlBottomY - 0.02 || triYMin > bowlTopY + 0.02) continue;
                sliceTriangles.push({
                  ax: vA.x,
                  ay: vA.y,
                  az: vA.z,
                  bx: vB.x,
                  by: vB.y,
                  bz: vB.z,
                  cx: vC.x,
                  cy: vC.y,
                  cz: vC.z,
                });
              }
            }

            function percentile(values, t) {
              if (!values.length) return 0;
              const sorted = values.slice().sort((a, b) => a - b);
              const idx = THREE.MathUtils.clamp(Math.floor((sorted.length - 1) * t), 0, sorted.length - 1);
              return sorted[idx];
            }

            function edgeSliceRadius(x0, y0, z0, x1, y1, z1, y, out) {
              if ((y0 < y && y1 < y) || (y0 > y && y1 > y)) return;
              const dy = y1 - y0;
              if (Math.abs(dy) < 1e-6) return;
              const t = (y - y0) / dy;
              if (t < 0 || t > 1) return;
              const x = THREE.MathUtils.lerp(x0, x1, t);
              const z = THREE.MathUtils.lerp(z0, z1, t);
              out.push(Math.hypot(x - centerX, z - centerZ));
            }

            for (let i = 0; i <= bins; i += 1) {
              const y = bowlBottomY + (i / bins) * bowlHeight;
              const sample = [];
              for (const tri of sliceTriangles) {
                edgeSliceRadius(tri.ax, tri.ay, tri.az, tri.bx, tri.by, tri.bz, y, sample);
                edgeSliceRadius(tri.bx, tri.by, tri.bz, tri.cx, tri.cy, tri.cz, y, sample);
                edgeSliceRadius(tri.cx, tri.cy, tri.cz, tri.ax, tri.ay, tri.az, y, sample);
              }
              if (sample.length < 12) {
                for (const p of bandSource) {
                  if (Math.abs(p.y - y) <= halfBin) sample.push(p.r);
                }
              }
              const inner = percentile(sample, 0.36);
              const outer = percentile(sample, 0.82);
              rawRadii[i] = outer - inner > 0.008 ? inner : percentile(sample, 0.55);
            }

            for (let i = 1; i <= bins; i += 1) {
              if (rawRadii[i] === 0) rawRadii[i] = rawRadii[i - 1];
            }
            for (let i = bins - 1; i >= 0; i -= 1) {
              if (rawRadii[i] === 0) rawRadii[i] = rawRadii[i + 1];
            }

            const insetFactor = LIQUID_CLEARANCE_SCALE;
            const wallGap = 0.006;
            const radii = rawRadii.map((_, i) => {
              const a = rawRadii[Math.max(0, i - 1)];
              const b = rawRadii[i];
              const c = rawRadii[Math.min(bins, i + 1)];
              const smooth = (a + b * 2 + c) / 4;
              return Math.max(smooth * insetFactor - wallGap, 0.02);
            });

            const profilePoints = [];
            for (let i = 0; i <= bins; i += 1) {
              const y = bowlBottomY + (i / bins) * bowlHeight;
              profilePoints.push(new THREE.Vector2(radii[i], y));
            }

            function radiusAt(normY) {
              const n = THREE.MathUtils.clamp(normY, 0, 1);
              const f = n * bins;
              const i0 = Math.floor(f);
              const i1 = Math.min(bins, i0 + 1);
              const a = radii[i0];
              const b = radii[i1];
              return THREE.MathUtils.lerp(a, b, f - i0);
            }

            return {
              profilePoints,
              bowlBottomY,
              bowlTopY,
              bowlHeight,
              radiusAt,
              centerX,
              centerZ,
              bowlMeshes,
              bowlBounds,
            };
          }

          function selectBowlMeshes(root, THREE) {
            const candidates = [];
            const box = new THREE.Box3();
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();

            root.traverse((obj) => {
              if (!obj.isMesh || !obj.geometry) return;
              box.setFromObject(obj);
              box.getSize(size);
              box.getCenter(center);
              if (size.y <= 0.0001) return;

              const name = (obj.name || "").toLowerCase();
              const nameHit = /(bowl|cup|glass|wine)/.test(name) ? 1 : 0;
              const radius = Math.max(size.x, size.z) * 0.5;
              const top = center.y + size.y * 0.5;
              const score =
                nameHit * 4 +
                radius * 2.2 +
                size.y * 0.5 +
                top * 0.12 -
                Math.abs(center.x) * 0.06 -
                Math.abs(center.z) * 0.06;

              candidates.push({
                obj,
                score,
                centerY: center.y,
                radius,
                top,
                nameHit,
              });
            });

            if (!candidates.length) return [];
            candidates.sort((a, b) => b.score - a.score);
            const primary = candidates[0];

            const picked = candidates
              .filter((c) => {
                if (c.obj === primary.obj) return true;
                if (c.nameHit && c.radius > primary.radius * 0.45) return true;
                const closeY = Math.abs(c.centerY - primary.centerY) < primary.radius * 0.9;
                const closeTop = Math.abs(c.top - primary.top) < primary.radius * 0.7;
                return c.radius > primary.radius * 0.5 && closeY && closeTop;
              })
              .map((c) => c.obj);

            return picked.length ? picked : [primary.obj];
          }

          function placeModel(root) {
            const box = new THREE.Box3().setFromObject(root);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const targetScale = (0.9 / Math.max(size.x, size.y, size.z)) * 1.25;

            root.scale.setScalar(targetScale);
            root.position.sub(center.multiplyScalar(targetScale));

            const yMin = new THREE.Box3().setFromObject(root).min.y;
            root.position.y -= yMin;
            const targetPosition = new THREE.Vector3(-0.14, root.position.y - 0.5, 0.32);
            const targetRotationY = -0.35;

            root.traverse((obj) => {
              if (!obj.isMesh) return;
              obj.castShadow = false;
              obj.receiveShadow = false;

              if (obj.material && obj.material.isMeshPhysicalMaterial) {
                obj.material.color.setRGB(0.96, 0.96, 0.98);
                obj.material.roughness = 0.05;
                obj.material.metalness = 0;
                obj.material.transmission = 1;
                obj.material.thickness = 0.2;
                obj.material.ior = 1.45;
                obj.material.opacity = 0.28;
                obj.material.transparent = true;
                obj.material.envMapIntensity = 1.8;
                obj.material.needsUpdate = true;
                obj.renderOrder = 20;
              }
            });

            const innerProfile = buildInnerBowlProfile(root, THREE);
            if (!innerProfile) {
              throw new Error("FailedToBuildInnerBowlProfile");
            }
            const { profilePoints, bowlBottomY, bowlTopY, bowlHeight, radiusAt, centerX, centerZ, bowlBounds, bowlMeshes } = innerProfile;
            const etchMaskTexture = createEtchMaskTexture(THREE, "sample");
            if (etchMaskTexture && bowlMeshes.length) {
              const engravingYCenter = bowlBottomY + bowlHeight * 0.62;
              const engravingHeight = bowlHeight * 0.17;
              const engravingAngleHalf = THREE.MathUtils.degToRad(24);
              for (const bowlMesh of bowlMeshes) {
                applyEngravingToGlassMesh(THREE, bowlMesh, {
                  maskTexture: etchMaskTexture,
                  centerX,
                  centerZ,
                  facingAngle: Math.PI * 0.5,
                  angleHalf: engravingAngleHalf,
                  yMin: engravingYCenter - engravingHeight * 0.5,
                  yMax: engravingYCenter + engravingHeight * 0.5,
                  depth: 0.00135,
                  normalStrength: 0.52,
                  roughnessBoost: 0.24,
                  initialFillY: bowlBottomY + bowlHeight * LIQUID_FILL_RATIO,
                });
              }
            }

            const wineLiquidConfig = {
              color: 0x4a0016,
              roughness: 0.18,
              transmission: 0.08,
              thickness: 1.35,
              ior: 1.352,
              opacity: 0.97,
              clearcoat: 0.16,
              clearcoatRoughness: 0.16,
              attenuationColor: 0x30000e,
              attenuationDistance: 0.32,
            };
            const liquidVolumeMaterial = createClippedWineMaterial(THREE, wineLiquidConfig);

            const liquidSurfaceMaterial = new THREE.MeshPhysicalMaterial({
              color: 0x4a0016,
              roughness: 0.08,
              metalness: 0,
              transmission: 0.1,
              thickness: 0.5,
              ior: 1.352,
              transparent: true,
              opacity: 0.96,
              clearcoat: 0.45,
              clearcoatRoughness: 0.06,
              attenuationColor: new THREE.Color(0x30000e),
              attenuationDistance: 0.24,
              side: THREE.DoubleSide,
              depthWrite: false,
            });

            const liquidMeniscusMaterial = new THREE.MeshPhysicalMaterial({
              color: 0x4a0016,
              roughness: 0.08,
              metalness: 0,
              transmission: 0.08,
              thickness: 0.2,
              ior: 1.352,
              transparent: true,
              opacity: 0.86,
              clearcoat: 0.5,
              clearcoatRoughness: 0.04,
              attenuationColor: new THREE.Color(0x30000e),
              attenuationDistance: 0.2,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
            liquidPivot = new THREE.Group();
            liquidPivot.position.set(centerX, 0, centerZ);
            liquidPivot.name = "wine-liquid-pivot";

            liquidVolume = new THREE.Mesh(new THREE.LatheGeometry(profilePoints, 84), liquidVolumeMaterial);
            liquidSurface = new THREE.Mesh(new THREE.CircleGeometry(1, 72), liquidSurfaceMaterial);
            liquidMeniscus = null;
            liquidVolume.name = "wine-liquid-volume";
            liquidSurface.name = "wine-liquid-surface";
            liquidVolume.renderOrder = 8;
            liquidSurface.renderOrder = 9;

            liquidRig = {
              bowlBottomY,
              bowlTopY,
              bowlHeight,
              radiusAt,
              fillMin: THREE.MathUtils.clamp(LIQUID_FILL_RATIO - 0.05, 0.25, 0.82),
              fillMax: THREE.MathUtils.clamp(LIQUID_FILL_RATIO + 0.04, 0.28, 0.88),
              wobbleX: 0,
              wobbleZ: 0,
              surfaceTiltX: 0,
              surfaceTiltZ: 0,
              fillHeight: bowlBottomY + bowlHeight * LIQUID_FILL_RATIO,
              fillNormal: new THREE.Vector3(0, 1, 0),
              surfaceRadius: radiusAt(LIQUID_FILL_RATIO),
            };

            const frontTextTexture = createFrontEngravingTexture(THREE, "대화가 쌓일수록\n깊어진다");
            if (frontTextTexture) {
              const engraveNormY = 0.79;
              const bowlCenterWorld = bowlBounds.getCenter(new THREE.Vector3());
              const bowlCenterLocal = root.worldToLocal(bowlCenterWorld.clone());
              const engraveY = bowlCenterLocal.y + bowlHeight * 0.32;
              const engraveRadius = radiusAt(engraveNormY) * 1.003;
              const engraveHeight = Math.max(engraveRadius * 0.21, 0.05);
              const engraveArc = THREE.MathUtils.degToRad(80);
              const engraveThetaStart = -engraveArc * 0.5 + THREE.MathUtils.degToRad(20);
              frontTextTexture.center.set(0.5, 0.5);
              frontTextTexture.rotation = 0;
              frontTextTexture.repeat.set(1, 1);
              frontTextTexture.needsUpdate = true;
              frontEngraving = new THREE.Mesh(
                new THREE.CylinderGeometry(
                  engraveRadius,
                  engraveRadius,
                  engraveHeight,
                  128,
                  1,
                  true,
                  engraveThetaStart,
                  engraveArc
                ),
                new THREE.MeshPhysicalMaterial({
                  map: frontTextTexture,
                  alphaMap: frontTextTexture,
                  transparent: true,
                  opacity: 0.02,
                  color: 0xfff2f6,
                  roughness: 0.34,
                  metalness: 0,
                  transmission: 0.58,
                  thickness: 0.02,
                  ior: 1.45,
                  depthWrite: false,
                  side: THREE.DoubleSide,
                })
              );
              frontEngraving.position.set(centerX, engraveY, centerZ - 0.001);
              frontEngraving.rotation.set(0, 0, 0);
              frontEngraving.name = "front-engraving";
              frontEngraving.renderOrder = 21;
              frontEngraving.userData = {
                engraveY,
              };
              root.add(frontEngraving);
              if (document.fonts && document.fonts.load) {
                document.fonts.load("400 170px Diphylleia").then(() => {
                  if (!frontEngraving || !frontEngraving.material) return;
                  const refreshedTexture = createFrontEngravingTexture(THREE, "대화가 쌓일수록\n깊어진다");
                  if (!refreshedTexture) return;
                  const oldTexture = frontEngraving.material.map;
                  frontEngraving.material.map = refreshedTexture;
                  frontEngraving.material.alphaMap = refreshedTexture;
                  frontEngraving.material.needsUpdate = true;
                  if (oldTexture && oldTexture !== refreshedTexture) {
                    oldTexture.dispose();
                  }
                });
              }
            } else {
              frontEngraving = null;
            }

            if (DEBUG_INNER_VOLUME) {
              innerVolumeDebug = new THREE.Mesh(
                new THREE.LatheGeometry(profilePoints, 48),
                new THREE.MeshBasicMaterial({ color: 0x00d4ff, wireframe: true, transparent: true, opacity: 0.28 })
              );
              innerVolumeDebug.renderOrder = 30;
              liquidPivot.add(innerVolumeDebug);
              innerGlassWireDebug = new THREE.Group();
              const glassWireMat = new THREE.MeshBasicMaterial({
                color: 0x7fc8ff,
                wireframe: true,
                transparent: true,
                opacity: 0.18,
                depthWrite: false,
              });
              for (const bowlMesh of bowlMeshes) {
                const wireMesh = new THREE.Mesh(bowlMesh.geometry, glassWireMat);
                wireMesh.position.copy(bowlMesh.position);
                wireMesh.quaternion.copy(bowlMesh.quaternion);
                wireMesh.scale.copy(bowlMesh.scale);
                wireMesh.renderOrder = 29;
                innerGlassWireDebug.add(wireMesh);
              }
              root.add(innerGlassWireDebug);
            } else {
              innerVolumeDebug = null;
              innerGlassWireDebug = null;
            }

            if (DEBUG_LIQUID_WIREFRAME) {
              liquidWireDebug = new THREE.Mesh(
                liquidVolume.geometry.clone(),
                new THREE.MeshBasicMaterial({ color: 0xff4b72, wireframe: true, transparent: true, opacity: 0.45, depthWrite: false })
              );
              liquidWireDebug.renderOrder = 31;
              liquidPivot.add(liquidWireDebug);
            } else {
              liquidWireDebug = null;
            }

            if (DEBUG_LIQUID_BOUNDS) {
              bowlBoundsBox = bowlBounds.clone();
              bowlBoundsHelper = new THREE.Box3Helper(bowlBoundsBox, 0x2ad4ff);
              bowlBoundsHelper.renderOrder = 31;
              scene.add(bowlBoundsHelper);
              wineBoundsBox = new THREE.Box3();
              wineBoundsHelper = new THREE.Box3Helper(wineBoundsBox, 0xffc24b);
              wineBoundsHelper.renderOrder = 32;
              scene.add(wineBoundsHelper);
            } else {
              bowlBoundsBox = null;
              wineBoundsBox = null;
              bowlBoundsHelper = null;
              wineBoundsHelper = null;
            }

            const startPosition = targetPosition.clone().add(new THREE.Vector3(0, -0.55, 0));
            const startScale = targetScale * 0.72;
            const startRotationY = targetRotationY - 1.05;
            const startRotationX = 1.08;

            root.position.copy(startPosition);
            root.scale.setScalar(startScale);
            root.rotation.x = startRotationX;
            root.rotation.y = startRotationY;

            wine = root;
            scene.add(root);
            wine.add(liquidPivot);
            liquidPivot.add(liquidVolume);
            liquidPivot.add(liquidSurface);
            if (liquidMeniscus) liquidPivot.add(liquidMeniscus);

            companionGlass = root.clone(true);
            companionGlass.visible = false;
            companionGlass.traverse((obj) => {
              if (!obj.isMesh) return;
              obj.renderOrder = Math.max(obj.renderOrder || 0, 19);
              if (obj.material) {
                obj.material = obj.material.clone();
                obj.material.transparent = true;
              }
            });
            const companionClonedLiquidPivot = companionGlass.getObjectByName("wine-liquid-pivot");
            if (companionClonedLiquidPivot && companionClonedLiquidPivot.parent) {
              companionClonedLiquidPivot.parent.remove(companionClonedLiquidPivot);
            }
            const companionEngraving = companionGlass.getObjectByName("front-engraving");
            if (companionEngraving && companionEngraving.parent) {
              companionEngraving.parent.remove(companionEngraving);
            }
            companionLiquidPivot = new THREE.Group();
            companionLiquidPivot.position.copy(liquidPivot.position);
            companionLiquidPivot.name = "wine-liquid-pivot";
            companionLiquidVolume = new THREE.Mesh(new THREE.LatheGeometry(profilePoints, 84), createClippedWineMaterial(THREE, wineLiquidConfig));
            companionLiquidSurface = new THREE.Mesh(new THREE.CircleGeometry(1, 72), liquidSurfaceMaterial.clone());
            companionLiquidVolume.renderOrder = 8;
            companionLiquidSurface.renderOrder = 9;
            companionLiquidPivot.add(companionLiquidVolume);
            companionLiquidPivot.add(companionLiquidSurface);
            companionGlass.add(companionLiquidPivot);
            scene.add(companionGlass);

            clinkTick = new THREE.Group();
            clinkTickRing = new THREE.Mesh(
              new THREE.RingGeometry(0.022, 0.034, 64),
              new THREE.MeshBasicMaterial({
                color: 0xffe6ef,
                transparent: true,
                opacity: 0,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false,
              })
            );
            clinkTickCore = new THREE.Mesh(
              new THREE.CircleGeometry(0.011, 36),
              new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false,
              })
            );
            clinkTick.add(clinkTickRing);
            clinkTick.add(clinkTickCore);
            clinkTick.visible = false;
            clinkTick.renderOrder = 40;
            scene.add(clinkTick);

            intro = {
              start: performance.now(),
              duration: 1950,
              fromPosition: startPosition,
              toPosition: targetPosition,
              fromScale: startScale,
              toScale: targetScale,
              fromRotationX: startRotationX,
              toRotationX: 0,
              fromRotationY: startRotationY,
              toRotationY: targetRotationY,
              cameraFrom: new THREE.Vector3(0.36, 1.45, 4.5),
              cameraTo: new THREE.Vector3(0.06, 1.06, 3.25),
            };

            const cameraStart = intro.cameraTo.clone();
            const lookStart = new THREE.Vector3(0.08, 0.02, 0.06);
            scrollRig = {
              cameraFrom: cameraStart,
              cameraMid: cameraStart.clone().add(new THREE.Vector3(0.86, 0.1, -0.34)),
              cameraTo: cameraStart.clone().add(new THREE.Vector3(0.34, 0.03, -0.22)),
              lookFrom: lookStart,
              lookMid: lookStart.clone().add(new THREE.Vector3(0.34, 0.04, 0.03)),
              lookTo: lookStart.clone().add(new THREE.Vector3(0.12, -0.03, 0.07)),
              winePosFrom: targetPosition.clone(),
              winePosMid: targetPosition.clone().add(new THREE.Vector3(-0.28, 0.02, 0.16)),
              winePosTo: targetPosition.clone().add(new THREE.Vector3(0.07, -0.1, 0.23)),
              wineRotYFrom: targetRotationY,
              wineRotYMid: targetRotationY + THREE.MathUtils.degToRad(38),
              wineRotYTo: targetRotationY + THREE.MathUtils.degToRad(3),
              wineRotYPunch: THREE.MathUtils.degToRad(14),
              wineRotZFrom: 0,
              wineRotZMid: THREE.MathUtils.degToRad(-8),
              wineRotZTo: THREE.MathUtils.degToRad(-1),
              wineRotXFrom: 0,
              wineRotXMid: THREE.MathUtils.degToRad(25),
              wineRotXTo: THREE.MathUtils.degToRad(1.2),
              wineScaleFrom: targetScale,
              wineScaleMid: targetScale * 1.2,
              wineScaleTo: targetScale * 1.26,
              fovFrom: 45,
              fovMid: 41,
              fovTo: 39.5,
              phaseSplit: 0.70,
            };
          }

          function updateWineLiquid(t, phaseOutRaw) {
            if (!wine || !liquidRig || !liquidPivot || !liquidVolume || !liquidSurface) return;

            const fillRise = easeInOutCubic(THREE.MathUtils.clamp((t + 0.02) / 0.56, 0, 1));
            const targetFill = THREE.MathUtils.lerp(liquidRig.fillMin, liquidRig.fillMax, fillRise);
            const topFillPush = easeInOutCubic(THREE.MathUtils.clamp((t - 0.68) / 0.46, 0, 1));
            const fill = THREE.MathUtils.clamp(THREE.MathUtils.lerp(targetFill, 1, topFillPush), 0, 1);
            const fillY = THREE.MathUtils.lerp(liquidRig.bowlBottomY + 0.03, liquidRig.bowlTopY, fill);

            const scrollVelocity = scrollTarget - scrollCurrent;
            const wobbleTargetX = THREE.MathUtils.clamp(scrollVelocity * 1.9 - wine.rotation.z * 0.32, -0.3, 0.3);
            const wobbleTargetZ = THREE.MathUtils.clamp(Math.sin(performance.now() * 0.0022) * 0.02 + wine.rotation.x * 0.22, -0.24, 0.24);
            liquidRig.wobbleX += (wobbleTargetX - liquidRig.wobbleX) * 0.08;
            liquidRig.wobbleZ += (wobbleTargetZ - liquidRig.wobbleZ) * 0.06;
            liquidRig.surfaceTiltX += (liquidRig.wobbleX - liquidRig.surfaceTiltX) * 0.16;
            liquidRig.surfaceTiltZ += (liquidRig.wobbleZ - liquidRig.surfaceTiltZ) * 0.14;

            liquidRig.fillHeight = fillY;
            if (etchedGlassUniforms.length) {
              for (const uniforms of etchedGlassUniforms) {
                uniforms.uFillY.value = fillY;
              }
            }
            wine.getWorldQuaternion(liquidParentQ);
            liquidParentQInv.copy(liquidParentQ).invert();
            liquidWorldUp.set(liquidRig.surfaceTiltX, 1, liquidRig.surfaceTiltZ).normalize();
            liquidLocalNormal.copy(liquidWorldUp).applyQuaternion(liquidParentQInv).normalize();
            liquidRig.fillNormal.copy(liquidLocalNormal);

            const volumeUniforms = liquidVolume.material.userData.liquidUniforms;
            if (volumeUniforms) {
              volumeUniforms.uFillHeight.value = liquidRig.fillHeight * liquidRig.fillNormal.y;
              volumeUniforms.uFillNormal.value.copy(liquidRig.fillNormal);
              volumeUniforms.uEdgeSoftness.value = 0.006;
            }

            const fillNorm = THREE.MathUtils.clamp((liquidRig.fillHeight - liquidRig.bowlBottomY) / liquidRig.bowlHeight, 0, 1);
            const surfaceRadius = liquidRig.radiusAt(fillNorm) * 0.94;
            liquidRig.surfaceRadius = surfaceRadius;
            liquidSurface.position.set(0, liquidRig.fillHeight, 0);
            liquidSurface.scale.set(surfaceRadius, surfaceRadius, 1);
            liquidSurfaceWorldQ.setFromEuler(new THREE.Euler(-Math.PI / 2 + liquidRig.surfaceTiltX * 0.85, 0, liquidRig.surfaceTiltZ * 0.85));
            liquidSurface.quaternion.copy(liquidParentQInv).multiply(liquidSurfaceWorldQ);

            if (liquidMeniscus) {
              liquidMeniscus.position.set(0, liquidRig.fillHeight - 0.003, 0);
              liquidMeniscus.scale.set(surfaceRadius * 0.985, surfaceRadius * 0.985, 0.8);
              liquidSurfaceWorldQ.setFromEuler(new THREE.Euler(Math.PI / 2 + liquidRig.surfaceTiltX * 0.82, 0, liquidRig.surfaceTiltZ * 0.82));
              liquidMeniscus.quaternion.copy(liquidParentQInv).multiply(liquidSurfaceWorldQ);
            }

            liquidVolume.material.opacity = THREE.MathUtils.lerp(0.88, 0.96, fill);
            liquidSurface.material.opacity = THREE.MathUtils.lerp(0.84, 0.95, fill);
            if (liquidMeniscus) liquidMeniscus.material.opacity = THREE.MathUtils.lerp(0.82, 0.92, fill);
            if (frontEngraving && frontEngraving.material) {
              const reveal = THREE.MathUtils.clamp((fillY - (frontEngraving.userData.engraveY - 0.02)) / 0.055, 0, 1);
              const revealEase = easeInOutCubic(reveal);
              frontEngraving.material.opacity = THREE.MathUtils.lerp(0.015, 0.58, revealEase) * (1 - finalTurnProgress);
            }
            if (DEBUG_LIQUID_BOUNDS && wineBoundsBox && wineBoundsHelper) {
              wineBoundsBox.setFromObject(liquidVolume);
              wineBoundsHelper.box.copy(wineBoundsBox);
            }

            if (companionGlass && companionLiquidVolume && companionLiquidSurface) {
              companionGlass.getWorldQuaternion(companionLiquidParentQ);
              companionLiquidParentQInv.copy(companionLiquidParentQ).invert();
              companionLiquidLocalNormal.copy(liquidWorldUp).applyQuaternion(companionLiquidParentQInv).normalize();
              const companionVolumeUniforms = companionLiquidVolume.material.userData.liquidUniforms;
              if (companionVolumeUniforms) {
                companionVolumeUniforms.uFillHeight.value = liquidRig.fillHeight * companionLiquidLocalNormal.y;
                companionVolumeUniforms.uFillNormal.value.copy(companionLiquidLocalNormal);
                companionVolumeUniforms.uEdgeSoftness.value = 0.006;
              }
              companionLiquidSurface.position.set(0, liquidRig.fillHeight, 0);
              companionLiquidSurface.scale.set(surfaceRadius, surfaceRadius, 1);
              liquidSurfaceWorldQ.setFromEuler(new THREE.Euler(-Math.PI / 2 + liquidRig.surfaceTiltX * 0.85, 0, liquidRig.surfaceTiltZ * 0.85));
              companionLiquidSurface.quaternion.copy(companionLiquidParentQInv).multiply(liquidSurfaceWorldQ);
            }
          }

          function loadModel(url) {
            loader.load(
              url,
              (gltf) => placeModel(gltf.scene),
              undefined,
              (err) => console.error(`Failed to load model: ${url}`, err)
            );
          }

          loadModel(modelUrl);

          function getScrollProgress() {
            const scroller = document.scrollingElement || document.documentElement;
            const y = scroller ? scroller.scrollTop : window.scrollY;
            const max = Math.max((scroller ? scroller.scrollHeight : document.documentElement.scrollHeight) - window.innerHeight, 1);
            const nativeT = THREE.MathUtils.clamp(y / max, 0, 1);
            return THREE.MathUtils.clamp(Math.max(nativeT, wheelProgress), 0, 1);
          }

          function animate() {
            requestAnimationFrame(animate);
            if (wine && intro) {
              finalTurnProgress = 0;
              if (companionGlass) companionGlass.visible = false;
              if (clinkTick) clinkTick.visible = false;
              const t = Math.min((performance.now() - intro.start) / intro.duration, 1);
              const moveT = THREE.MathUtils.smoothstep(t, 0, 1);
              const popT = easeOutCubic(t);
              const tiltT = easeInOutCubic(Math.min(t * 1.04, 1));
              wine.position.lerpVectors(intro.fromPosition, intro.toPosition, moveT);
              wine.scale.setScalar(THREE.MathUtils.lerp(intro.fromScale, intro.toScale, popT));
              wine.rotation.x = THREE.MathUtils.lerp(intro.fromRotationX, intro.toRotationX, tiltT);
              wine.rotation.y = THREE.MathUtils.lerp(intro.fromRotationY, intro.toRotationY, moveT);
              camera.position.lerpVectors(intro.cameraFrom, intro.cameraTo, moveT);
              camera.lookAt(0.08, 0.02, 0.06);
              ambient.intensity = THREE.MathUtils.lerp(0, 1.35, moveT);
              hemi.intensity = THREE.MathUtils.lerp(0, 1.1, moveT);
              key.intensity = THREE.MathUtils.lerp(0, 1.6, moveT);
              rim.intensity = THREE.MathUtils.lerp(0, 0.95, moveT);
              fill.intensity = THREE.MathUtils.lerp(0, 0.9, moveT);
              if (veil) {
                veil.style.opacity = String(THREE.MathUtils.lerp(0.9, 0, moveT));
              }
              if (t >= 1) {
                intro = null;
                if (veil) veil.style.display = "none";
              }
              updateWineLiquid(0, 0);
            } else if (wine && scrollRig) {
              scrollTarget = getScrollProgress();
              const delta = scrollTarget - scrollCurrent;
              if (Math.abs(delta) < 0.0005) {
                scrollCurrent = scrollTarget;
              } else {
                scrollCurrent += delta * 0.12;
              }

              const tRaw = THREE.MathUtils.clamp(scrollCurrent, 0, 1);
              const isMobileLayout = window.innerWidth <= 900;
              const t = mapScrollProgressWithHold(tRaw, THREE);
              const liquidT = THREE.MathUtils.clamp(tRaw / 0.72, 0, 1);
              const phaseInRaw = THREE.MathUtils.clamp(t / scrollRig.phaseSplit, 0, 1);
              const phaseOutRaw = THREE.MathUtils.clamp((t - scrollRig.phaseSplit) / (1 - scrollRig.phaseSplit), 0, 1);
              const phaseIn = easeInOutCubic(phaseInRaw);
              const phaseOut = easeInOutCubic(phaseOutRaw);
              const twistPunch = Math.sin(phaseIn * Math.PI) * scrollRig.wineRotYPunch * (1 - phaseOut);
              const finalTurnRaw = THREE.MathUtils.clamp((tRaw - TURN_START_RAW) / Math.max(1 - TURN_START_RAW, 1e-6), 0, 1);
              const finalTurn = THREE.MathUtils.smootherstep(finalTurnRaw, 0, 1);
              const clinkRaw = THREE.MathUtils.clamp((phaseInRaw - 0.54) / 0.32, 0, 1);
              const fadeRaw = THREE.MathUtils.clamp((phaseInRaw - 0.66) / 0.34, 0, 1);
              finalTurnProgress = finalTurn;

              const phase1Pos = new THREE.Vector3().lerpVectors(scrollRig.winePosFrom, scrollRig.winePosMid, phaseIn);
              wine.position.lerpVectors(phase1Pos, scrollRig.winePosTo, phaseOut);
              const phase1RotX = THREE.MathUtils.lerp(scrollRig.wineRotXFrom, scrollRig.wineRotXMid, phaseIn);
              wine.rotation.x = THREE.MathUtils.lerp(phase1RotX, scrollRig.wineRotXTo, phaseOut);
              const phase1RotY = THREE.MathUtils.lerp(scrollRig.wineRotYFrom, scrollRig.wineRotYMid, phaseIn) + twistPunch;
              const baseRotY = THREE.MathUtils.lerp(phase1RotY, scrollRig.wineRotYTo, phaseOut);
              wine.rotation.y = baseRotY + finalTurn * Math.PI;
              const phase1RotZ = THREE.MathUtils.lerp(scrollRig.wineRotZFrom, scrollRig.wineRotZMid, phaseIn);
              wine.rotation.z = THREE.MathUtils.lerp(phase1RotZ, scrollRig.wineRotZTo, phaseOut);
              const phase1Scale = THREE.MathUtils.lerp(scrollRig.wineScaleFrom, scrollRig.wineScaleMid, phaseIn);
              wine.scale.setScalar(THREE.MathUtils.lerp(phase1Scale, scrollRig.wineScaleTo, phaseOut));

              if (companionGlass) {
                if (clinkRaw > 0.001) {
                  companionGlass.visible = true;
                  const enter = easeOutCubic(THREE.MathUtils.clamp(clinkRaw / 0.62, 0, 1));
                  const settle = easeInOutCubic(THREE.MathUtils.clamp((clinkRaw - 0.62) / 0.38, 0, 1));
                  const fromOffset = isMobileLayout ? new THREE.Vector3(-0.7, 0.1, 0.16) : new THREE.Vector3(-1.25, 0.12, 0.22);
                  const hitOffset = isMobileLayout ? new THREE.Vector3(-0.22, 0.05, 0.05) : new THREE.Vector3(-0.36, 0.05, 0.06);
                  const settleOffset = isMobileLayout ? new THREE.Vector3(-0.33, 0.06, 0.09) : new THREE.Vector3(-0.52, 0.06, 0.11);
                  const fromPos = wine.position.clone().add(fromOffset);
                  const hitPos = wine.position.clone().add(hitOffset);
                  const settlePos = wine.position.clone().add(settleOffset);
                  const approachPos = new THREE.Vector3().lerpVectors(fromPos, hitPos, enter);
                  companionGlass.position.lerpVectors(approachPos, settlePos, settle);
                  companionGlass.quaternion.copy(wine.quaternion);
                  companionGlass.rotation.y -= 0.45;
                  companionGlass.rotation.x += 0.08;
                  companionGlass.rotation.z -= 0.22;
                  companionGlass.scale.copy(wine.scale).multiplyScalar(0.98);
                  const companionOpacity = 1 - THREE.MathUtils.smootherstep(fadeRaw, 0, 1);
                  companionGlass.traverse((obj) => {
                    if (!obj.isMesh || !obj.material) return;
                    if (obj === companionLiquidVolume || obj === companionLiquidSurface) return;
                    obj.material.opacity = 0.28 * companionOpacity;
                  });
                  if (companionLiquidVolume && companionLiquidVolume.material) {
                    companionLiquidVolume.material.opacity = THREE.MathUtils.lerp(0.88, 0.96, liquidT) * companionOpacity;
                  }
                  if (companionLiquidSurface && companionLiquidSurface.material) {
                    companionLiquidSurface.material.opacity = THREE.MathUtils.lerp(0.84, 0.95, liquidT) * companionOpacity;
                  }

                  const tapPulse = Math.sin(THREE.MathUtils.clamp((clinkRaw - 0.52) / 0.22, 0, 1) * Math.PI);
                  wine.position.x += tapPulse * 0.02;
                  wine.position.z += tapPulse * 0.01;
                } else {
                  companionGlass.visible = false;
                }
              }

              if (clinkTick) {
                const tickRaw = THREE.MathUtils.clamp((clinkRaw - 0.5) / 0.26, 0, 1);
                const tickPulse = Math.sin(tickRaw * Math.PI);
                if (tickPulse > 0.001) {
                  clinkTick.visible = true;
                  const wineRimPoint = new THREE.Vector3(-0.22, 0.18, 0.01).applyQuaternion(wine.quaternion).add(wine.position);
                  const companionRimPoint = companionGlass && companionGlass.visible
                    ? new THREE.Vector3(0.19, 0.18, 0.01).applyQuaternion(companionGlass.quaternion).add(companionGlass.position)
                    : wineRimPoint.clone();
                  clinkTick.position.lerpVectors(wineRimPoint, companionRimPoint, 0.5);
                  clinkTick.scale.setScalar(1);
                  if (clinkTickRing && clinkTickRing.material) {
                    clinkTickRing.scale.setScalar(1 + tickRaw * 2.6);
                    clinkTickRing.material.opacity = tickPulse * 0.9;
                  }
                  if (clinkTickCore && clinkTickCore.material) {
                    clinkTickCore.scale.setScalar(1 + tickRaw * 0.95);
                    clinkTickCore.material.opacity = tickPulse * 0.75;
                  }
                  clinkTick.lookAt(camera.position);
                } else {
                  clinkTick.visible = false;
                }
              }

              const phase1Cam = new THREE.Vector3().lerpVectors(scrollRig.cameraFrom, scrollRig.cameraMid, phaseIn);
              camera.position.lerpVectors(phase1Cam, scrollRig.cameraTo, phaseOut);
              const phase1Look = new THREE.Vector3().lerpVectors(scrollRig.lookFrom, scrollRig.lookMid, phaseIn);
              lookTarget.lerpVectors(phase1Look, scrollRig.lookTo, phaseOut);
              const phase1Fov = THREE.MathUtils.lerp(scrollRig.fovFrom, scrollRig.fovMid, phaseIn);
              camera.fov = THREE.MathUtils.lerp(phase1Fov, scrollRig.fovTo, phaseOut);
              camera.updateProjectionMatrix();
              camera.lookAt(lookTarget);

              const textInProgress = THREE.MathUtils.clamp((phaseIn - 0.24) / 0.68, 0, 1);
              const textInEase = easeOutCubic(textInProgress);
              const textInBlurEase = easeOutCubic(THREE.MathUtils.clamp((textInProgress - 0.3) / 0.9, 0, 1));
              const textOutEase = easeInOutCubic(phaseOutRaw);
              const textOpacity = textInEase * (1 - textOutEase) * (1 - finalTurn);
              const textBlurPx = THREE.MathUtils.lerp(8, 0, textInBlurEase) + THREE.MathUtils.lerp(0, 9, textOutEase);
              const textOffsetX = THREE.MathUtils.lerp(34, 0, textInEase) + THREE.MathUtils.lerp(0, 28, textOutEase);

              if (finalTurn >= 0.999) {
                if (endTurnReachedAt === null) endTurnReachedAt = performance.now();
              } else {
                endTurnReachedAt = null;
              }
              const endDelayMs = 300;
              const sinceTurnMs = endTurnReachedAt === null ? 0 : Math.max(performance.now() - endTurnReachedAt, 0);
              const mobileExitRaw = isMobileLayout ? THREE.MathUtils.clamp((sinceTurnMs - 80) / 1200, 0, 1) : 0;
              const mobileExitEase = easeInOutCubic(mobileExitRaw);
              const endElapsed = endTurnReachedAt === null ? 0 : Math.max(performance.now() - endTurnReachedAt - endDelayMs, 0);
              const endTextRaw = THREE.MathUtils.clamp(endElapsed / 900, 0, 1);
              const endTextEase = easeInOutCubic(endTextRaw);
              const endQrRaw = THREE.MathUtils.clamp((endElapsed - 420) / 900, 0, 1);
              const endQrEase = easeInOutCubic(endQrRaw);

              if (isMobileLayout && mobileExitEase > 0) {
                wine.position.x += THREE.MathUtils.lerp(0, -1.05, mobileExitEase);
                wine.position.y += THREE.MathUtils.lerp(0, -0.56, mobileExitEase);
              }

              if (revealCopy) {
                revealCopy.style.opacity = String(textOpacity);
                revealCopy.style.filter = `blur(${textBlurPx.toFixed(2)}px)`;
                const offsetY = window.innerWidth <= 900 ? "0" : "-50%";
                revealCopy.style.transform = `translate3d(${textOffsetX.toFixed(1)}px, ${offsetY}, 0)`;
              }
              if (revealLines.length) {
                for (let i = 0; i < revealLines.length; i += 1) {
                  const line = revealLines[i];
                  const local = THREE.MathUtils.clamp((textInEase - i * 0.16) / 0.58, 0, 1);
                  const lineEase = easeOutCubic(local);
                  const lineVisibility = lineEase * (1 - textOutEase);
                  line.style.opacity = String(lineVisibility);
                  line.style.transform = `translate3d(0, ${(THREE.MathUtils.lerp(18, 0, lineEase) + THREE.MathUtils.lerp(0, 14, textOutEase)).toFixed(1)}px, 0)`;
                  line.style.filter = `blur(${(THREE.MathUtils.lerp(4, 0, lineEase) + THREE.MathUtils.lerp(0, 5, textOutEase)).toFixed(2)}px)`;
                }
              }
              if (endTextImage) {
                endTextImage.style.opacity = String(endTextEase);
                endTextImage.style.filter = `blur(${THREE.MathUtils.lerp(8, 0, endTextEase).toFixed(2)}px)`;
                endTextImage.style.transform = `translate3d(0, ${THREE.MathUtils.lerp(14, 0, endTextEase).toFixed(1)}px, 0) scale(${THREE.MathUtils.lerp(0.97, 1, endTextEase).toFixed(4)})`;
              }
              if (endQrImage) {
                endQrImage.style.opacity = String(endQrEase);
                endQrImage.style.filter = `blur(${THREE.MathUtils.lerp(8, 0, endQrEase).toFixed(2)}px)`;
                endQrImage.style.transform = `translate3d(0, ${THREE.MathUtils.lerp(14, 0, endQrEase).toFixed(1)}px, 0) scale(${THREE.MathUtils.lerp(0.97, 1, endQrEase).toFixed(4)})`;
              }

              updateWineLiquid(liquidT, phaseOutRaw);

            }
            renderer.render(scene, camera);
          }
          animate();

          if ("scrollRestoration" in history) {
            history.scrollRestoration = "manual";
          }
          window.scrollTo(0, 0);
          scrollTarget = 0;
          scrollCurrent = 0;
          wheelProgress = 0;

          window.addEventListener(
            "wheel",
            (event) => {
              wheelProgress = THREE.MathUtils.clamp(wheelProgress + event.deltaY * WHEEL_SCROLL_SENSITIVITY, 0, 1);
            },
            { passive: true }
          );

          window.addEventListener("resize", () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          });
        } catch (err) {
          console.error(err);
          if (err && err.message === "WebGLUnavailable") {
            showFatalError("WebGL is disabled/unavailable in this browser session. Enable GPU acceleration and WebGL, then reload.");
          } else {
            showFatalError("3D scene failed to initialize. Check console for details.");
          }
        }
      }

      init();

      function playLogoIntro() {
        if (!logoIntro || !logoIntroImg) return Promise.resolve();
        const fadeInMs = 1150;
        const holdMs = 520;
        const fadeOutMs = 1100;
        const totalMs = fadeInMs + holdMs + fadeOutMs;
        logoIntro.style.display = "flex";
        logoIntroImg.style.opacity = "0";
        logoIntroImg.style.transform = "translate3d(0, 10px, 0) scale(0.93)";
        logoIntroImg.style.filter = "blur(5px) drop-shadow(0 16px 34px rgba(0, 0, 0, 0.42))";

        return new Promise((resolve) => {
          let start = null;
          const ease = (p) => {
            const c1 = 1.70158;
            const c2 = c1 * 1.12;
            return p < 0.5
              ? (Math.pow(2 * p, 2) * ((c2 + 1) * 2 * p - c2)) / 2
              : (Math.pow(2 * p - 2, 2) * ((c2 + 1) * (p * 2 - 2) + c2) + 2) / 2;
          };
          const easeOut = (p) => 1 - Math.pow(1 - p, 3);
          function step(now) {
            if (start === null) start = now;
            const elapsed = now - start;

            if (elapsed < fadeInMs) {
              const p = elapsed / fadeInMs;
              const e = easeOut(p);
              const blur = (1 - e) * 5;
              const y = (1 - e) * 10;
              const scale = 0.93 + e * 0.07;
              const glow = 0.34 + e * 0.24;
              logoIntroImg.style.opacity = e.toFixed(4);
              logoIntroImg.style.transform = `translate3d(0, ${y.toFixed(3)}px, 0) scale(${scale.toFixed(4)})`;
              logoIntroImg.style.filter = `blur(${blur.toFixed(3)}px) drop-shadow(0 16px 34px rgba(0, 0, 0, ${glow.toFixed(3)}))`;
              requestAnimationFrame(step);
              return;
            }

            if (elapsed < fadeInMs + holdMs) {
              const holdP = (elapsed - fadeInMs) / holdMs;
              const breathe = Math.sin(holdP * Math.PI) * 0.008;
              logoIntroImg.style.opacity = "1";
              logoIntroImg.style.transform = `translate3d(0, ${(-breathe * 6).toFixed(3)}px, 0) scale(${(1 + breathe).toFixed(4)})`;
              logoIntroImg.style.filter = "blur(0px) drop-shadow(0 18px 36px rgba(0, 0, 0, 0.58))";
              requestAnimationFrame(step);
              return;
            }

            if (elapsed < totalMs) {
              const p = (elapsed - fadeInMs - holdMs) / fadeOutMs;
              const e = ease(p);
              const alpha = 1 - e;
              const blur = e * 4.2;
              const y = e * -8;
              const scale = 1 + e * 0.045;
              const glow = 0.58 - e * 0.2;
              logoIntroImg.style.opacity = alpha.toFixed(4);
              logoIntroImg.style.transform = `translate3d(0, ${y.toFixed(3)}px, 0) scale(${scale.toFixed(4)})`;
              logoIntroImg.style.filter = `blur(${blur.toFixed(3)}px) drop-shadow(0 18px 36px rgba(0, 0, 0, ${glow.toFixed(3)}))`;
              requestAnimationFrame(step);
              return;
            }

            logoIntro.style.display = "none";
            resolve();
          }

          requestAnimationFrame(step);
        });
      }
