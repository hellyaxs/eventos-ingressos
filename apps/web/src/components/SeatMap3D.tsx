import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type Seat3D = {
  id: string;
  label: string;
  row: number;
  col: number;
  available: boolean;
  owned?: boolean;
};

type SeatMap3DProps = {
  seats: Seat3D[];
  rows: number;
  cols: number;
  selectedIds: string[];
  onToggleSeat: (seatId: string) => void;
  interactive?: boolean;
  onUnsupported?: () => void;
};

function tokenHex(varName: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const hex = raw.replace(/^#/, '');
  const parsed = /^[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex, 16) : Number.NaN;
  return Number.isNaN(parsed) ? fallback : parsed;
}

const COLOR = {
  background: tokenHex('--color-bg', 0x0a0a0a),
  floor: tokenHex('--color-muted', 0x555555),
  grid: tokenHex('--neutral-100', 0x2a2a2a),
  seat: tokenHex('--neutral-200', 0x444444),
  seatBack: tokenHex('--neutral-100', 0x2a2a2a),
  hover: tokenHex('--neutral-500', 0xededed),
  selected: tokenHex('--color-accent', 0x0070f3),
  taken: tokenHex('--neutral-50', 0x1a1a1a),
  owned: tokenHex('--color-warning', 0xf5a623),
  screen: tokenHex('--neutral-50', 0x1a1a1a),
  screenEdge: tokenHex('--color-accent', 0x0070f3),
  label: `#${tokenHex('--neutral-400', 0x888888).toString(16).padStart(6, '0')}`,
};

const SEAT_GAP = 1.15;
const CLICK_TOLERANCE_PX = 6;

type SeatEntry = {
  seat: Seat3D;
  group: THREE.Group;
  pad: THREE.Mesh;
  back: THREE.Mesh;
  baseY: number;
};

function makeLabelSprite(text: string, height = 0.7): THREE.Sprite {
  const ratio = Math.max(text.length, 1);
  const canvas = document.createElement('canvas');
  canvas.height = 96;
  canvas.width = 96 * ratio;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = COLOR.label;
    ctx.font = 'bold 52px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true }),
  );
  sprite.scale.set(height * ratio, height, 1);
  return sprite;
}

export function SeatMap3D({
  seats,
  rows,
  cols,
  selectedIds,
  onToggleSeat,
  interactive = true,
  onUnsupported,
}: SeatMap3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const seatEntriesRef = useRef<SeatEntry[]>([]);
  const selectedRef = useRef<string[]>(selectedIds);
  const hoveredRef = useRef<string | null>(null);
  const interactiveRef = useRef(interactive);
  const onToggleRef = useRef(onToggleSeat);
  const [hoveredSeat, setHoveredSeat] = useState<Seat3D | null>(null);

  selectedRef.current = selectedIds;
  interactiveRef.current = interactive;
  onToggleRef.current = onToggleSeat;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || seats.length === 0) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      onUnsupported?.();
      return;
    }

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 420;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR.background);
    scene.fog = new THREE.Fog(COLOR.background, cols * 1.6, cols * 3.4 + rows * 2);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 400);

    const ambient = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(cols * 0.35, rows * 1.6 + 6, rows * 0.9 + 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(-cols * 0.4, 4, -rows);
    scene.add(rim);

    // Geometrias e materiais compartilhados entre todos os assentos.
    const padGeometry = new THREE.BoxGeometry(0.78, 0.16, 0.78);
    const backGeometry = new THREE.BoxGeometry(0.78, 0.42, 0.14);
    const materials = {
      seat: new THREE.MeshStandardMaterial({ color: COLOR.seat, roughness: 0.75, metalness: 0.05 }),
      seatBack: new THREE.MeshStandardMaterial({ color: COLOR.seatBack, roughness: 0.8 }),
      hover: new THREE.MeshStandardMaterial({ color: COLOR.hover, roughness: 0.4 }),
      selected: new THREE.MeshStandardMaterial({ color: COLOR.selected, roughness: 0.35 }),
      taken: new THREE.MeshStandardMaterial({ color: COLOR.taken, roughness: 0.9 }),
      owned: new THREE.MeshStandardMaterial({ color: COLOR.owned, roughness: 0.55 }),
    };

    const disposables: Array<{ dispose: () => void }> = [
      padGeometry,
      backGeometry,
      ...Object.values(materials),
    ];

    const seatGroup = new THREE.Group();
    scene.add(seatGroup);

    const offsetX = ((cols - 1) * SEAT_GAP) / 2;
    const offsetZ = ((rows - 1) * SEAT_GAP) / 2;
    const entries: SeatEntry[] = [];

    seats.forEach((seat) => {
      const group = new THREE.Group();
      // Fileiras mais ao fundo ficam mais altas, como numa sala real.
      const baseY = (seat.row - 1) * 0.14;
      group.position.set(
        (seat.col - 1) * SEAT_GAP - offsetX,
        baseY,
        (seat.row - 1) * SEAT_GAP - offsetZ,
      );

      const pad = new THREE.Mesh(
        padGeometry,
        seat.owned ? materials.owned : seat.available ? materials.seat : materials.taken,
      );
      pad.position.y = 0.08;
      pad.userData.seatId = seat.id;

      const back = new THREE.Mesh(
        backGeometry,
        seat.owned ? materials.owned : seat.available ? materials.seatBack : materials.taken,
      );
      back.position.set(0, 0.3, -0.32);

      group.add(pad, back);
      seatGroup.add(group);
      entries.push({ seat, group, pad, back, baseY });
    });

    seatEntriesRef.current = entries;

    // Palco / tela ao fundo do mapa.
    const screenWidth = Math.max(cols * SEAT_GAP * 0.82, 4);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(screenWidth, Math.max(rows * 0.35, 1.8)),
      new THREE.MeshBasicMaterial({ color: COLOR.screen }),
    );
    screen.position.set(0, Math.max(rows * 0.2, 1.2), -offsetZ - 2.6);
    scene.add(screen);
    disposables.push(screen.geometry, screen.material);

    const screenEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(screen.geometry),
      new THREE.LineBasicMaterial({ color: COLOR.screenEdge }),
    );
    screenEdges.position.copy(screen.position);
    scene.add(screenEdges);
    disposables.push(screenEdges.geometry, screenEdges.material);

    const screenLabel = makeLabelSprite('TELA', 0.8);
    screenLabel.position.set(0, screen.position.y, screen.position.z + 0.05);
    scene.add(screenLabel);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(cols * SEAT_GAP + 8, rows * SEAT_GAP + 10),
      new THREE.MeshStandardMaterial({ color: COLOR.floor, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);
    disposables.push(floor.geometry, floor.material);

    const grid = new THREE.GridHelper(
      Math.max(cols, rows) * SEAT_GAP + 6,
      Math.round((Math.max(cols, rows) + 6) / 2),
      COLOR.grid,
      COLOR.grid,
    );
    grid.position.y = 0;
    scene.add(grid);
    disposables.push(grid.geometry, grid.material as THREE.Material);

    // Letras das fileiras à esquerda.
    const rowSprites: THREE.Sprite[] = [];
    for (let row = 1; row <= rows; row += 1) {
      const sprite = makeLabelSprite(String.fromCharCode(64 + row));
      sprite.position.set(-offsetX - 1.2, (row - 1) * 0.14 + 0.4, (row - 1) * SEAT_GAP - offsetZ);
      scene.add(sprite);
      rowSprites.push(sprite);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = Math.max(cols, rows) * 0.5;
    controls.maxDistance = Math.max(cols, rows) * 2 + 10;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.32;
    controls.target.set(0, 0.5, -offsetZ * 0.15);

    // Enquadra o conjunto de assentos com base na maior dimensão da sala.
    const spread = Math.max(cols * SEAT_GAP, rows * SEAT_GAP * 1.1);
    camera.position.set(0, spread * 0.42 + 2, spread * 0.62 + 3);
    camera.lookAt(controls.target);
    controls.update();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerInside = false;
    let pointerDownAt: { x: number; y: number } | null = null;
    const pads = entries.map((entry) => entry.pad);

    function updatePointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickSeatId(): string | null {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pads, false);
      const first = hits[0]?.object as THREE.Mesh | undefined;
      const seatId = first?.userData.seatId as string | undefined;
      if (!seatId) return null;
      const entry = entries.find((item) => item.seat.id === seatId);
      return entry && entry.seat.available && !entry.seat.owned ? seatId : null;
    }

    function handlePointerMove(event: PointerEvent) {
      pointerInside = true;
      updatePointer(event);
    }

    function handlePointerLeave() {
      pointerInside = false;
      hoveredRef.current = null;
      setHoveredSeat(null);
      renderer.domElement.style.cursor = 'default';
    }

    function handlePointerDown(event: PointerEvent) {
      pointerDownAt = { x: event.clientX, y: event.clientY };
    }

    function handlePointerUp(event: PointerEvent) {
      if (!pointerDownAt || !interactiveRef.current) {
        pointerDownAt = null;
        return;
      }
      const movedX = Math.abs(event.clientX - pointerDownAt.x);
      const movedY = Math.abs(event.clientY - pointerDownAt.y);
      pointerDownAt = null;
      // Arrastar orbita a câmera; só cliques "parados" selecionam um assento.
      if (movedX > CLICK_TOLERANCE_PX || movedY > CLICK_TOLERANCE_PX) return;

      updatePointer(event);
      const seatId = pickSeatId();
      if (seatId) {
        onToggleRef.current(seatId);
      }
    }

    const dom = renderer.domElement;
    dom.addEventListener('pointermove', handlePointerMove);
    dom.addEventListener('pointerleave', handlePointerLeave);
    dom.addEventListener('pointerdown', handlePointerDown);
    dom.addEventListener('pointerup', handlePointerUp);

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      if (nextWidth === 0 || nextHeight === 0) return;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(container);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let previous = performance.now();

    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;

      if (pointerInside && interactiveRef.current) {
        const seatId = pickSeatId();
        if (seatId !== hoveredRef.current) {
          hoveredRef.current = seatId;
          const entry = entries.find((item) => item.seat.id === seatId);
          setHoveredSeat(entry ? entry.seat : null);
          dom.style.cursor = seatId ? 'pointer' : 'default';
        }
      }

      entries.forEach((entry) => {
        const isSelected = selectedRef.current.includes(entry.seat.id);
        const isHovered = hoveredRef.current === entry.seat.id;

        if (entry.seat.owned) {
          entry.pad.material = materials.owned;
          entry.back.material = materials.owned;
        } else if (!entry.seat.available) {
          entry.pad.material = materials.taken;
          entry.back.material = materials.taken;
        } else if (isSelected) {
          entry.pad.material = materials.selected;
          entry.back.material = materials.selected;
        } else if (isHovered) {
          entry.pad.material = materials.hover;
          entry.back.material = materials.seatBack;
        } else {
          entry.pad.material = materials.seat;
          entry.back.material = materials.seatBack;
        }

        const lift = isSelected ? 0.42 : isHovered ? 0.18 : 0;
        const targetY = entry.baseY + lift;
        entry.group.position.y = reduceMotion
          ? targetY
          : THREE.MathUtils.damp(entry.group.position.y, targetY, 9, delta);

        const targetScale = isSelected ? 1.06 : 1;
        const scale = reduceMotion
          ? targetScale
          : THREE.MathUtils.damp(entry.group.scale.x, targetScale, 9, delta);
        entry.group.scale.setScalar(scale);
      });

      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      dom.removeEventListener('pointermove', handlePointerMove);
      dom.removeEventListener('pointerleave', handlePointerLeave);
      dom.removeEventListener('pointerdown', handlePointerDown);
      dom.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();

      rowSprites.concat(screenLabel).forEach((sprite) => {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      });
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      dom.remove();
      seatEntriesRef.current = [];
      hoveredRef.current = null;
    };
  }, [seats, rows, cols, onUnsupported]);

  return (
    <div className="seatmap3d">
      <div ref={containerRef} className="seatmap3d-canvas" />
      <div className="seatmap3d-hud" aria-hidden="true">
        {hoveredSeat
          ? hoveredSeat.owned
            ? `Assento ${hoveredSeat.label} — você já comprou este ingresso`
            : `Assento ${hoveredSeat.label}`
          : 'Arraste para girar · roda para zoom'}
      </div>
      {/* O canvas WebGL não é navegável por teclado: espelhamos os assentos em controles acessíveis. */}
      <div className="sr-only" role="group" aria-label="Mapa de assentos (3D)">
        {seats.map((seat) => (
          <button
            key={seat.id}
            type="button"
            disabled={!seat.available || !interactive || Boolean(seat.owned)}
            aria-pressed={selectedIds.includes(seat.id)}
            onClick={() => onToggleSeat(seat.id)}
          >
            {seat.owned
              ? `Assento ${seat.label} — você já comprou este ingresso`
              : `Assento ${seat.label}`}
          </button>
        ))}
      </div>
    </div>
  );
}
