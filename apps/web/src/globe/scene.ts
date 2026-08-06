/* Region-selection globe.
 *
 * This is the optional launch/selection visual permitted by
 * docs/project-status.md — permitted *because* the analytical journey is
 * already complete without it. It selects a district; it never explains one.
 * Nothing here renders an indicator value, and nothing downstream depends on it
 * having loaded.
 *
 * Everything is created inside `mount()` and released by the returned
 * `dispose()`: geometries, materials, textures and the WebGL context all leak
 * without explicit disposal in three.js, and this component is unmounted every
 * time the user collapses the panel.
 *
 * The atmosphere shader is imported from orbital-website rather than
 * reimplemented — one scattering integrator, one place to fix it. */

import * as THREE from 'three';
import { ATMOSPHERE_GLSL, SRGB_GLSL } from '@globe/shaders.js';
import dayUrl from '@globe/assets/earth_day.jpg';
import nightUrl from '@globe/assets/earth_night.jpg';
import cloudUrl from '@globe/assets/earth_clouds.jpg';

const EARTH_R = 1;
const CLOUD_R = 1.006;
const ATMO_R = 1.035;          // must equal R_TOP in shaders.js
const SUN_DIR = new THREE.Vector3(-0.4, 0.28, 0.87).normalize();
const SUN_I = 1.15 * Math.PI;  // ties the scattering integral to the surface term

export interface GlobeMarker {
  id: string;
  name: string;
  /** [longitude, latitude] */
  centroid: [number, number];
}

export interface GlobeHandle {
  dispose(): void;
  /** Turn the globe so the given marker faces the camera. */
  focus(id: string): void;
  setSelected(id: string | null): void;
}

function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export function mount(
  host: HTMLElement,
  markers: GlobeMarker[],
  opts: {
    onSelect: (id: string) => void;
    onHover: (id: string | null) => void;
    reducedMotion: boolean;
  },
): GlobeHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.01, 100);
  camera.position.set(0, 0.5, 3.0);
  camera.lookAt(0, 0, 0);

  const loader = new THREE.TextureLoader();
  const tex = (url: string) => {
    const t = loader.load(url);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  const dayMap = tex(dayUrl);
  const nightMap = tex(nightUrl);
  const cloudMap = tex(cloudUrl);

  const spin = new THREE.Group();
  spin.rotation.z = THREE.MathUtils.degToRad(23.4);
  scene.add(spin);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R, 128, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: dayMap },
        uNight: { value: nightMap },
        uSun: { value: SUN_DIR.clone() },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
        void main() {
          vUv = uv;
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uDay, uNight; uniform vec3 uSun;
        varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
        ${SRGB_GLSL}
        void main() {
          vec3 N = normalize(vN);
          vec3 L = normalize(uSun);
          float ndl = dot(N, L);
          float lit = smoothstep(-0.16, 0.26, ndl);
          vec3 day = decode(texture2D(uDay, vUv).rgb);
          vec3 night = decode(texture2D(uNight, vUv).rgb);
          vec3 col = day * (0.03 + 1.1 * max(ndl, 0.0));
          col += night * vec3(1.0, 0.82, 0.55) * 2.4 * smoothstep(0.08, -0.22, ndl);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  spin.add(earth);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(CLOUD_R, 96, 48),
    new THREE.MeshBasicMaterial({
      map: cloudMap, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  spin.add(clouds);

  // Full scattering, 16 steps — plenty for a decorative shell at this size.
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(ATMO_R, 96, 48),
    new THREE.ShaderMaterial({
      defines: { ATMO_STEPS: 16, LIGHT_STEPS: 5 },
      uniforms: { uSun: { value: SUN_DIR.clone() }, uSunI: { value: SUN_I } },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSun; uniform float uSunI;
        varying vec3 vWorld;
        ${ATMOSPHERE_GLSL}
        void main() {
          vec3 ro = cameraPosition;
          vec3 rd = normalize(vWorld - ro);
          vec2 slab = raySphere(ro, rd, R_TOP);
          if (slab.x > slab.y) discard;
          vec2 ground = raySphere(ro, rd, R_GROUND);
          if (ground.x <= ground.y && ground.y > 0.0) discard;
          vec3 insc, trans;
          scatter(ro, rd, max(slab.x, 0.0), slab.y, normalize(uSun), uSunI, insc, trans);
          gl_FragColor = vec4(insc, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  scene.add(atmosphere);

  /* ── district pins ─────────────────────────────────────────────────────── */
  const pinGroup = new THREE.Group();
  spin.add(pinGroup);

  const pinGeo = new THREE.SphereGeometry(0.022, 20, 14);
  const pins = markers.map((marker) => {
    const material = new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(pinGeo, material);
    mesh.position.copy(latLonToVec3(marker.centroid[1], marker.centroid[0], EARTH_R * 1.012));
    mesh.userData.id = marker.id;
    pinGroup.add(mesh);
    return { marker, mesh, material };
  });

  /* ── interaction ───────────────────────────────────────────────────────── */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-10, -10);
  let hovered: string | null = null;
  let selected: string | null = null;
  let dragging = false;
  let dragged = 0;
  let lastX = 0;
  let yaw = 0;
  let targetYaw: number | null = null;

  const onPointerMove = (e: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    if (dragging) {
      const dx = e.clientX - lastX;
      dragged += Math.abs(dx);
      yaw += dx * 0.006;
      lastX = e.clientX;
      targetYaw = null;
    }
  };
  const onPointerDown = (e: PointerEvent) => { dragging = true; dragged = 0; lastX = e.clientX; };
  const onPointerUp = () => { dragging = false; };
  const onClick = () => {
    // A drag that ends on a pin is not a click on it.
    if (dragged > 5) return;
    if (hovered) opts.onSelect(hovered);
  };
  const onLeave = () => { pointer.set(-10, -10); dragging = false; };

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerleave', onLeave);
  addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('click', onClick);

  const onResize = () => {
    if (!host.clientWidth || !host.clientHeight) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  };
  const observer = new ResizeObserver(onResize);
  observer.observe(host);

  /* ── frame loop ────────────────────────────────────────────────────────── */
  const timer = new THREE.Timer();
  let raf = 0;

  function tick(timestamp?: number) {
    raf = requestAnimationFrame(tick);
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 0.05);

    // Reduced motion: no idle drift. The globe still responds to a deliberate
    // drag, but it does not move on its own.
    if (!opts.reducedMotion && !dragging && targetYaw === null) yaw += dt * 0.045;
    if (targetYaw !== null) {
      yaw += (targetYaw - yaw) * Math.min(1, dt * (opts.reducedMotion ? 20 : 3.2));
      if (Math.abs(targetYaw - yaw) < 0.002) { yaw = targetYaw; targetYaw = null; }
    }
    spin.rotation.y = yaw;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pins.map((p) => p.mesh), false);
    const nowHovered = (hits[0]?.object.userData.id as string | undefined) ?? null;
    if (nowHovered !== hovered) {
      hovered = nowHovered;
      opts.onHover(hovered);
      renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
    }

    for (const pin of pins) {
      const isSel = pin.marker.id === selected;
      const isHov = pin.marker.id === hovered;
      pin.mesh.scale.setScalar(isSel ? 1.5 : isHov ? 1.3 : 1);
      pin.material.color.setHex(isSel ? 0x58b7ff : 0xffb454);
    }

    renderer.render(scene, camera);
  }
  tick();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('click', onClick);
      removeEventListener('pointerup', onPointerUp);

      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      dayMap.dispose(); nightMap.dispose(); cloudMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    focus(id) {
      const pin = pins.find((p) => p.marker.id === id);
      if (!pin) return;
      const lon = pin.marker.centroid[0];
      // Bring the marker's meridian to face the camera (+Z).
      targetYaw = -THREE.MathUtils.degToRad(lon) - Math.PI / 2;
    },
    setSelected(id) { selected = id; },
  };
}
