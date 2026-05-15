      import * as THREE from "../../vendor/three.module.js";
      import { PLYLoader } from "../../vendor/PLYLoader.mjs";

      gsap.registerPlugin(ScrollTrigger);

      const canvas = document.getElementById("sceneCanvas");
      const modelStatus = document.getElementById("modelStatus");
      const modelStatusText = modelStatus?.querySelector(".status-text");
      const modelBadge = document.getElementById("hudFile");
      function setModelStatus(text, mode) {
        if (modelStatusText) modelStatusText.textContent = text;
        if (modelStatus) {
          modelStatus.classList.toggle("is-loading", mode === "loading");
          modelStatus.classList.toggle("is-ready", mode === "ready");
        }
      }
      const modelPreset = document.getElementById("modelPreset");
      const qualityPreset = document.getElementById("qualityPreset");
      const chaosPreset = document.getElementById("chaosPreset");
      const stylePreset = document.getElementById("stylePreset");
      const stepCards = Array.from(document.querySelectorAll(".step-card"));
      const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

      const scene = new THREE.Scene();
      const initialFog = document.documentElement.dataset.theme === "light" ? 0xfbf8ef : 0x0b0f16;
      scene.fog = new THREE.Fog(initialFog, 4.6, 12.8);
      window.addEventListener("gv-theme-change", (e) => {
        if (scene.fog && e.detail && typeof e.detail.fog === "number") {
          scene.fog.color.setHex(e.detail.fog);
        }
      });

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 0.16, 2.62);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

      const ambient = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambient);
      const key = new THREE.DirectionalLight(0x9ad7ff, 0.9);
      key.position.set(3, 2, 2);
      scene.add(key);

      const root = new THREE.Group();
      scene.add(root);

      let points = null;
      let beam = null;
      let pointCount = 0;
      let outPositions = null;
      let pointAttr = null;
      let modelPositions = null;
      let chaosPositions = null;
      let colorAttr = null;
      let baseColorAttr = null;
      let noiseVec = null;
      let noisePhase = null;
      let chaosFlowPhase = null;
      let chaosFlowSpread = 1;
      let clock = new THREE.Clock();
      let lastColorMix = -1;

      const state = {
        morph: 0,
        chaos: 1,
        colorMix: 0,
        opacity: 1,
        pointSize: 0.018,
        beamIntensity: 1,
        finalClarity: 0,
        visibleRatio: 0.42,
        yLift: 0.42,
        gridSnap: 0,
      };

      const startNeon = new THREE.Color(0xffffff);
      const cTmp = new THREE.Color();
      const vividTmp = new THREE.Color();
      const hslTmp = { h: 0, s: 0, l: 0 };
      let pointSprite = null;
      let scrollInitialized = false;
      let currentPreset = "100k";
      let currentStylePreset = "original";
      let currentModelPreset = "besedka";
      let currentChaosPreset = "sphere";
      let loadTicket = 0;

      function fitRenderer() {
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      function activateCard(index) {
        stepCards.forEach((card, i) => {
          const isActive = i === index;
          card.classList.toggle("active", isActive);
          card.classList.toggle("dimmed", !isActive);
        });
      }

      function targetPointsForPreset() {
        return currentPreset === "1m" ? 1_000_000 : 100_000;
      }

      function samplePositions(src, wantedCount) {
        const srcCount = src.length / 3;
        const count = Math.max(1, wantedCount);
        const out = new Float32Array(count * 3);
        if (count <= srcCount) {
          const stride = srcCount / count;
          for (let i = 0; i < count; i += 1) {
            const idx = Math.floor(i * stride) * 3;
            out[i * 3] = src[idx];
            out[i * 3 + 1] = src[idx + 1];
            out[i * 3 + 2] = src[idx + 2];
          }
        } else {
          for (let i = 0; i < count; i += 1) {
            const srcI = Math.floor(Math.random() * srcCount) * 3;
            const j = 0.0025;
            out[i * 3] = src[srcI] + (Math.random() - 0.5) * j;
            out[i * 3 + 1] = src[srcI + 1] + (Math.random() - 0.5) * j;
            out[i * 3 + 2] = src[srcI + 2] + (Math.random() - 0.5) * j;
          }
        }
        return out;
      }

      function sampleColors(src, wantedCount) {
        const srcCount = src.length / 3;
        const count = Math.max(1, wantedCount);
        const out = new Float32Array(count * 3);
        if (count <= srcCount) {
          const stride = srcCount / count;
          for (let i = 0; i < count; i += 1) {
            const idx = Math.floor(i * stride) * 3;
            out[i * 3] = src[idx];
            out[i * 3 + 1] = src[idx + 1];
            out[i * 3 + 2] = src[idx + 2];
          }
        } else {
          for (let i = 0; i < count; i += 1) {
            const srcI = Math.floor(Math.random() * srcCount) * 3;
            out[i * 3] = src[srcI];
            out[i * 3 + 1] = src[srcI + 1];
            out[i * 3 + 2] = src[srcI + 2];
          }
        }
        return out;
      }

      function makeShuffledIndices(count) {
        const indices = new Uint32Array(count);
        for (let i = 0; i < count; i += 1) indices[i] = i;
        for (let i = count - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = indices[i];
          indices[i] = indices[j];
          indices[j] = tmp;
        }
        return indices;
      }

      function remapTriplets(src, indices) {
        const out = new Float32Array(src.length);
        for (let i = 0; i < indices.length; i += 1) {
          const from = indices[i] * 3;
          const to = i * 3;
          out[to] = src[from];
          out[to + 1] = src[from + 1];
          out[to + 2] = src[from + 2];
        }
        return out;
      }

      function createChaosPositions(target, preset = "sphere") {
        const out = new Float32Array(target.length);
        chaosFlowPhase = null;
        let radius = 0;
        for (let i = 0; i < target.length; i += 3) {
          const r = Math.hypot(target[i], target[i + 1], target[i + 2]);
          if (r > radius) radius = r;
        }
        const spread = Math.max(1, radius * 0.44);
        chaosFlowSpread = spread;

        if (preset === "infinity") {
          const a = spread * 0.62;
          const phases = new Float32Array(target.length / 3);
          for (let i = 0; i < target.length; i += 3) {
            const t = Math.random() * Math.PI * 2;
            const x = a * Math.sin(t);
            const y = a * Math.sin(t) * Math.cos(t) * 0.56;
            const z = spread * 0.05 * Math.cos(2 * t);
            out[i] = x + (Math.random() - 0.5) * spread * 0.06;
            out[i + 1] = y + (Math.random() - 0.5) * spread * 0.06;
            out[i + 2] = z + (Math.random() - 0.5) * spread * 0.04;
            phases[i / 3] = t + (Math.random() - 0.5) * 0.25;
          }
          chaosFlowPhase = phases;
          return out;
        }

        if (preset === "wind") {
          const lanes = 24;
          for (let i = 0; i < target.length; i += 3) {
            const lane = Math.floor(Math.random() * lanes);
            const laneY = (lane / (lanes - 1) - 0.5) * spread * 0.62;
            const t = Math.random();
            const x = (t - 0.5) * spread * 1.04;
            const phase = t * Math.PI * 5.2 + lane * 0.45;
            out[i] = x;
            out[i + 1] = laneY + Math.sin(phase) * spread * 0.05 + (Math.random() - 0.5) * spread * 0.025;
            out[i + 2] = Math.cos(phase * 0.82) * spread * 0.13 + (Math.random() - 0.5) * spread * 0.04;
          }
          return out;
        }

        if (preset === "tachymeter") {
          const headR = spread * 0.2;
          const bodyH = spread * 0.44;
          for (let i = 0; i < target.length; i += 3) {
            const zone = Math.random();
            if (zone < 0.42) {
              const a = Math.random() * Math.PI * 2;
              const r = headR * (0.3 + Math.random() * 0.7);
              out[i] = Math.cos(a) * r;
              out[i + 1] = bodyH * 0.35 + (Math.random() - 0.5) * spread * 0.06;
              out[i + 2] = Math.sin(a) * r;
            } else if (zone < 0.74) {
              const h = (Math.random() - 0.5) * bodyH;
              out[i] = (Math.random() - 0.5) * spread * 0.16;
              out[i + 1] = h;
              out[i + 2] = (Math.random() - 0.5) * spread * 0.12;
            } else {
              const leg = Math.floor(Math.random() * 3);
              const f = Math.random();
              const ang = leg * (Math.PI * 2 / 3) + Math.PI / 6;
              const rx = Math.cos(ang) * spread * 0.34;
              const rz = Math.sin(ang) * spread * 0.34;
              out[i] = rx * f + (Math.random() - 0.5) * spread * 0.03;
              out[i + 1] = -bodyH * 0.05 - f * spread * 0.58 + (Math.random() - 0.5) * spread * 0.04;
              out[i + 2] = rz * f + (Math.random() - 0.5) * spread * 0.03;
            }
          }
          return out;
        }

        for (let i = 0; i < target.length; i += 3) {
          const u = Math.random();
          const v = Math.random();
          const w = Math.random();
          const theta = 2 * Math.PI * u;
          const phi = Math.acos(2 * v - 1);
          const rr = spread * (0.1 + Math.cbrt(w) * 0.45);
          out[i] = rr * Math.sin(phi) * Math.cos(theta) * 0.86;
          out[i + 1] = rr * Math.cos(phi) * 0.78;
          out[i + 2] = rr * Math.sin(phi) * Math.sin(theta);
        }
        return out;
      }

      function createNoise(count) {
        const vectors = new Float32Array(count * 3);
        const phases = new Float32Array(count);
        for (let i = 0; i < count; i += 1) {
          const k = i * 3;
          let x = Math.random() * 2 - 1;
          let y = Math.random() * 2 - 1;
          let z = Math.random() * 2 - 1;
          const len = Math.hypot(x, y, z) || 1;
          vectors[k] = x / len;
          vectors[k + 1] = y / len;
          vectors[k + 2] = z / len;
          phases[i] = Math.random() * Math.PI * 2;
        }
        return { vectors, phases };
      }

      function makeRoundPointSprite(size = 64) {
        const spriteCanvas = document.createElement("canvas");
        spriteCanvas.width = size;
        spriteCanvas.height = size;
        const ctx = spriteCanvas.getContext("2d");
        if (!ctx) return null;
        const center = size / 2;
        const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.35, "rgba(255,255,255,0.95)");
        grad.addColorStop(0.7, "rgba(255,255,255,0.35)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(spriteCanvas);
        tex.needsUpdate = true;
        return tex;
      }

      function updateColorsIfNeeded(force = false) {
        if (!colorAttr || !baseColorAttr) return;
        if (!force && Math.abs(state.colorMix - lastColorMix) < 0.035) return;
        lastColorMix = state.colorMix;
        for (let i = 0; i < pointCount; i += 1) {
          const r = baseColorAttr.getX(i);
          const g = baseColorAttr.getY(i);
          const b = baseColorAttr.getZ(i);
          vividTmp.setRGB(r, g, b);
          vividTmp.getHSL(hslTmp);
          hslTmp.s = Math.max(0.78, hslTmp.s);
          hslTmp.l = Math.max(0.58, hslTmp.l);
          vividTmp.setHSL(hslTmp.h, hslTmp.s, hslTmp.l);
          cTmp.copy(startNeon).lerp(vividTmp, state.colorMix);
          colorAttr.setXYZ(i, cTmp.r, cTmp.g, cTmp.b);
        }
        colorAttr.needsUpdate = true;
      }

      function setupScroll() {
        if (scrollInitialized) return;
        scrollInitialized = true;
        const section = document.getElementById("scrolly");
        ScrollTrigger.create({
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.7,
          onUpdate: (self) => {
            const p = self.progress;
            state.morph = THREE.MathUtils.smoothstep(p, 0.0, 0.9);
            state.colorMix = THREE.MathUtils.smoothstep(p, 0.08, 0.32);
            state.chaos = 1 - THREE.MathUtils.smoothstep(p, 0.01, 0.68);
            state.beamIntensity = 1 - THREE.MathUtils.smoothstep(p, 0.18, 0.46);
            state.finalClarity = THREE.MathUtils.smoothstep(p, 0.72, 1);
            const snapProgress = THREE.MathUtils.smoothstep(p, 0.74, 1);
            state.gridSnap = currentStylePreset === "grid" ? snapProgress : 0;
            const targetVisibleProgress = THREE.MathUtils.smoothstep(p, 0.0, 0.84);
            const startRatio = Math.min(1, 100000 / Math.max(1, pointCount));
            state.visibleRatio = startRatio + targetVisibleProgress * (1 - startRatio);
            state.opacity = 1;
            state.pointSize = 0.018 - THREE.MathUtils.smoothstep(p, 0.58, 1) * 0.0032;
            state.yLift = 0.42 * (1 - THREE.MathUtils.smoothstep(p, 0.02, 0.58));
            activateCard(Math.min(3, Math.floor(p * 4)));
          },
        });

        stepCards.forEach((card) => {
          ScrollTrigger.create({
            trigger: card,
            start: "top 94%",
            end: "bottom 10%",
            scrub: 0.75,
            onUpdate: (self) => {
              const p = self.progress;
              const enterPhase = Math.min(1, p / 0.35);
              const exitPhase = Math.max(0, (p - 0.65) / 0.35);

              const y = gsap.utils.interpolate(56, 0, enterPhase);
              const enterOpacity = gsap.utils.interpolate(0, 1, enterPhase);
              const exitOpacity = gsap.utils.interpolate(1, 0.08, exitPhase);
              const opacity = p < 0.65 ? enterOpacity : exitOpacity;
              const blur = p < 0.35 ? gsap.utils.interpolate(12, 0, enterPhase) : gsap.utils.interpolate(0, 4, exitPhase);

              card.style.transform = `translate3d(0, ${y}px, 0)`;
              card.style.opacity = String(opacity);
              card.style.filter = `blur(${blur}px)`;
            },
          });
        });
      }

      function buildPointScene(srcPos, srcColor) {
        if (points) {
          root.remove(points);
          points.geometry.dispose();
          points.material.dispose();
          points = null;
        }

        const maxPoints = targetPointsForPreset();
        const sampledPos = samplePositions(srcPos, maxPoints);
        pointCount = sampledPos.length / 3;
        const sampledColors = sampleColors(srcColor, pointCount);
        const shuffled = makeShuffledIndices(pointCount);
        modelPositions = remapTriplets(sampledPos, shuffled);
        const remappedColors = remapTriplets(sampledColors, shuffled);
        chaosPositions = createChaosPositions(modelPositions, currentChaosPreset);
        outPositions = chaosPositions.slice(0);

        const geometry = new THREE.BufferGeometry();
        pointAttr = new THREE.BufferAttribute(outPositions, 3);
        colorAttr = new THREE.BufferAttribute(remappedColors.slice(0), 3);
        baseColorAttr = new THREE.BufferAttribute(remappedColors.slice(0), 3);
        geometry.setAttribute("position", pointAttr);
        geometry.setAttribute("color", colorAttr);
        geometry.setAttribute("baseColor", baseColorAttr);
        state.visibleRatio = Math.min(1, 100000 / Math.max(1, pointCount));
        geometry.setDrawRange(0, Math.floor(pointCount * state.visibleRatio));
        pointSprite = makeRoundPointSprite(64);

        points = new THREE.Points(
          geometry,
          new THREE.PointsMaterial({
            size: state.pointSize,
            vertexColors: true,
            transparent: true,
            opacity: state.opacity,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            map: pointSprite,
            alphaMap: pointSprite,
            alphaTest: 0.02,
          }),
        );
        root.add(points);

        const noise = createNoise(pointCount);
        noiseVec = noise.vectors;
        noisePhase = noise.phases;

        setModelStatus(`Модель загружена • ${pointCount.toLocaleString()} точек`, "ready");
        if (modelBadge) modelBadge.textContent = getBadgeText();
        updateColorsIfNeeded(true);
        activateCard(0);
        setupScroll();
      }

      const loader = new PLYLoader();
      const modelSources = {
        besedka: {
          badge: { "100k": "BESEDKA_WEB_100K.PLY", "1m": "BESEDKA_WEB_1M.PLY" },
          presets: { "100k": "models/Besedka_web_100k.ply", "1m": "models/Besedka_web_1m.ply" },
          fallback: ["models/Mesh_web_100k.ply", "models/Model.ply"],
        },
        mesh: {
          badge: { "100k": "MESH_WEB_100K.PLY", "1m": "MESH_WEB_1M.PLY" },
          presets: { "100k": "models/Mesh_web_100k.ply", "1m": "models/Mesh_web_1m.ply" },
          fallback: [encodeURI("models/Mesh[Объект - 2.00 mm] (level 11).ply"), "models/Model.ply"],
        },
      };

      function getActiveSource() {
        return modelSources[currentModelPreset] || modelSources.besedka;
      }

      function getBadgeText() {
        const source = getActiveSource();
        return source.badge[currentPreset] || source.badge["100k"];
      }

      function onGeometryLoaded(geometry, ticket) {
          if (ticket !== loadTicket) return;
          geometry.computeBoundingBox();
          geometry.center();
          geometry.rotateX(-Math.PI / 2);
          geometry.computeBoundingSphere();
          const radius = geometry.boundingSphere?.radius || 1;
          const scale = 0.76 / Math.max(0.001, radius);
          geometry.scale(scale, scale, scale);

          const pos = geometry.getAttribute("position").array;
          const srcColorAttr = geometry.getAttribute("color");
          let colors = null;
          if (srcColorAttr) {
            colors = srcColorAttr.array.slice(0);
          } else {
            colors = new Float32Array((pos.length / 3) * 3);
            for (let i = 0; i < colors.length; i += 3) {
              colors[i] = 0.2 + Math.random() * 0.8;
              colors[i + 1] = 0.45 + Math.random() * 0.55;
              colors[i + 2] = 0.55 + Math.random() * 0.45;
            }
          }
          buildPointScene(pos, colors);
      }

      function onGeometryError(error, ticket) {
          if (ticket !== loadTicket) return;
          setModelStatus("Ошибка PLY: fallback", "loading");
          console.error("PLY load error:", error);
          const fallback = new THREE.TorusKnotGeometry(0.85, 0.25, 360, 36);
          const posAttr = fallback.getAttribute("position");
          const pos = new Float32Array(posAttr.count * 3);
          const colors = new Float32Array(posAttr.count * 3);
          for (let i = 0; i < posAttr.count; i += 1) {
            pos[i * 3] = posAttr.getX(i);
            pos[i * 3 + 1] = posAttr.getY(i);
            pos[i * 3 + 2] = posAttr.getZ(i);
            colors[i * 3] = 0.6;
            colors[i * 3 + 1] = 0.7;
            colors[i * 3 + 2] = 0.85;
          }
          buildPointScene(pos, colors);
      }

      function loadModelPreset() {
        loadTicket += 1;
        const ticket = loadTicket;
        const source = getActiveSource();
        const primaryPath = source.presets[currentPreset] || source.presets["100k"];
        const fallbackChain = source.fallback || [];
        setModelStatus("Загрузка модели...", "loading");
        if (modelBadge) modelBadge.textContent = getBadgeText();
        loader.load(
          primaryPath,
          (g) => onGeometryLoaded(g, ticket),
          undefined,
          () => {
            const [firstFallback, secondFallback] = fallbackChain;
            if (firstFallback) {
              loader.load(
                firstFallback,
                (g) => onGeometryLoaded(g, ticket),
                undefined,
                () => {
                  if (secondFallback) {
                    loader.load(secondFallback, (g) => onGeometryLoaded(g, ticket), undefined, (e) => onGeometryError(e, ticket));
                  } else {
                    onGeometryError(new Error("Fallback model missing"), ticket);
                  }
                },
              );
            } else {
              onGeometryError(new Error("No model preset fallback configured"), ticket);
            }
          },
        );
      }

      if (modelPreset) {
        modelPreset.value = currentModelPreset;
        modelPreset.addEventListener("change", (e) => {
          currentModelPreset = e.target.value === "mesh" ? "mesh" : "besedka";
          loadModelPreset();
        });
      }

      if (qualityPreset) {
        qualityPreset.value = currentPreset;
        qualityPreset.addEventListener("change", (e) => {
          currentPreset = e.target.value === "1m" ? "1m" : "100k";
          loadModelPreset();
        });
      }

      if (chaosPreset) {
        chaosPreset.value = currentChaosPreset;
        chaosPreset.addEventListener("change", (e) => {
          currentChaosPreset = e.target.value || "sphere";
          if (modelPositions) chaosPositions = createChaosPositions(modelPositions, currentChaosPreset);
        });
      }

      if (stylePreset) {
        stylePreset.value = currentStylePreset;
        stylePreset.addEventListener("change", (e) => {
          currentStylePreset = e.target.value === "grid" ? "grid" : "original";
        });
      }

      loadModelPreset();

      function animate() {
        const t = clock.getElapsedTime();
        const lockInfinityRotation = currentChaosPreset === "infinity" && state.chaos > 0.08;
        if (!lockInfinityRotation) {
          root.rotation.y += prefersReduced ? 0.0006 : 0.0024;
        }
        root.position.y = state.yLift;

        if (points && pointAttr && modelPositions && chaosPositions) {
          const m = state.morph;
          const inv = 1 - m;
          const chaosAmp = 0.036 * state.chaos * (0.55 + 0.45 * (1 - state.visibleRatio));
          const gridStep = 0.012;
          const gridSnap = state.gridSnap;
          const visibleCount = Math.max(1, Math.floor(pointCount * state.visibleRatio));
          const isInfinityPreset = currentChaosPreset === "infinity";
          for (let i = 0; i < visibleCount; i += 1) {
            const k = i * 3;
            const wobbleBase = chaosAmp * (0.5 + 0.5 * Math.sin(t * 2.2 + noisePhase[i]));
            const wobble = isInfinityPreset ? wobbleBase * 0.18 : wobbleBase;
            let x = chaosPositions[k] * inv + modelPositions[k] * m + noiseVec[k] * wobble;
            let y = chaosPositions[k + 1] * inv + modelPositions[k + 1] * m + noiseVec[k + 1] * wobble;
            let z = chaosPositions[k + 2] * inv + modelPositions[k + 2] * m + noiseVec[k + 2] * wobble;

            if (state.chaos > 0.001) {
              if (currentChaosPreset === "infinity" && chaosFlowPhase && chaosFlowPhase[i] !== undefined) {
                const tt = chaosFlowPhase[i] + t * 0.55 * state.chaos;
                const aInf = chaosFlowSpread * 0.62;
                const fx = aInf * Math.sin(tt);
                const fy = aInf * Math.sin(tt) * Math.cos(tt) * 0.56;
                x = THREE.MathUtils.lerp(x, fx, 0.9 * state.chaos);
                y = THREE.MathUtils.lerp(y, fy, 0.9 * state.chaos);
                z = THREE.MathUtils.lerp(z, chaosPositions[k + 2], 0.9 * state.chaos);
              } else if (currentChaosPreset === "wind") {
                const flowAmp = 0.07 * state.chaos;
                y += Math.sin(x * 6.5 + t * 2.1 + noisePhase[i]) * flowAmp;
                z += Math.cos(x * 4.2 - t * 1.7 + noisePhase[i] * 0.7) * flowAmp * 0.85;
              }
            }

            if (gridSnap > 0) {
              const gx = Math.round(x / gridStep) * gridStep;
              const gy = Math.round(y / gridStep) * gridStep;
              const gz = Math.round(z / gridStep) * gridStep;
              x = THREE.MathUtils.lerp(x, gx, gridSnap);
              y = THREE.MathUtils.lerp(y, gy, gridSnap);
              z = THREE.MathUtils.lerp(z, gz, gridSnap);
            }

            outPositions[k] = x;
            outPositions[k + 1] = y;
            outPositions[k + 2] = z;
          }
          pointAttr.needsUpdate = true;
          points.material.size = state.pointSize;
          points.material.opacity = state.opacity;
          points.material.blending = THREE.NormalBlending;
          points.material.depthWrite = true;
          points.geometry.setDrawRange(0, visibleCount);
          updateColorsIfNeeded();
        }
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }

      window.addEventListener("resize", fitRenderer);
      fitRenderer();
      animate();
