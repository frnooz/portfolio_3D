import * as THREE from 'three';
import { damp } from './core/math';
import { buildLayout, RACK, SPAWN, type Item, type Layout } from './world/layout';
import { Racks, createSharedUniforms, type SharedUniforms } from './world/racks';
import { Robot } from './world/robot';
import { Room } from './world/room';
import { CameraRig } from './systems/cameraRig';
import { Input } from './systems/input';
import { Physics, boxFromCenter } from './systems/physics';
import { Panel } from './ui/panel';

/** Proto : une seule baie interactive (UbeRTaxi). */
const PROTO_ONLY_FIRST_RACK = true;

export class Experience {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly layout: Layout;
  readonly uniforms: SharedUniforms = createSharedUniforms();
  readonly room: Room;
  readonly racks: Racks;
  readonly robot = new Robot();
  readonly rig: CameraRig;
  readonly physics: Physics;
  readonly input = new Input();
  readonly panel = new Panel();
  private readonly items: Item[];
  private active: Item | null = null;
  private activeAmt = 0;
  private readonly clock = new THREE.Clock();
  private time = 0;
  private readonly move = { x: 0, z: 0 };
  private readonly focus = new THREE.Vector3();
  private compact = false;

  constructor() {
    const canvas = document.getElementById('scene') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color('#030405');
    this.scene.fog = new THREE.FogExp2('#030405', 0.028);

    this.layout = buildLayout();
    if (PROTO_ONLY_FIRST_RACK) {
      this.layout.racks = this.layout.racks.filter((r) => r.kind === 'project').slice(0, 1);
      this.layout.items = this.layout.items.filter((i) => i.rackIndex === 0);
    }
    this.items = this.layout.items;

    this.room = new Room(this.layout, this.uniforms);
    this.racks = new Racks(this.layout.racks, this.uniforms);
    this.scene.add(this.room.group, this.racks.group, this.robot.group);

    this.physics = new Physics(this.layout.room);
    for (const r of this.layout.racks) this.physics.add(boxFromCenter(r.x, r.z, RACK.w + 0.04, RACK.d + 0.1));

    // lumière d'ambiance : froide, basse, la salle est éclairée par ses LEDs
    this.scene.add(new THREE.HemisphereLight('#3d5a75', '#07090b', 1.1));
    const key = new THREE.DirectionalLight('#a9c8ff', 1.1);
    key.position.set(-6, 12, 9);
    this.scene.add(key);

    this.robot.position.set(SPAWN.x, 0, SPAWN.z);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.resize();
    this.rig.snap(this.robot.position);

    this.input.onAction((a) => {
      if (a === 'interact' && this.panel.isOpen) this.panel.focus();
      if (a === 'escape' && this.panel.isOpen) this.panel.close(true);
    });

    window.addEventListener('resize', this.resize);
    this.renderer.setAnimationLoop(this.tick);
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.compact = w <= 760;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
  };

  private updateInteraction(dt: number) {
    const p = this.robot.position;
    let best: Item | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      const d = Math.hypot(p.x - it.x, p.z - it.z);
      const r = it === this.active ? 1.8 : 1.35; // hystérésis : pas de clignotement en bord de zone
      if (d < r && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    if (this.panel.dismissed && best?.id !== this.panel.dismissed) this.panel.dismissed = null;
    if (best && best.id === this.panel.dismissed) best = null;

    if (best !== this.active) {
      if (this.active?.rackIndex !== undefined) this.racks.setOpen(this.active.rackIndex, false);
      this.active = best;
      if (best) {
        this.panel.show(best);
        if (best.rackIndex !== undefined) {
          this.racks.setOpen(best.rackIndex, true);
          this.uniforms.uActive.value = best.rackIndex;
          this.activeAmt = 0;
        }
        this.robot.setMood('happy', 1.4);
        this.robot.setProbe(true);
      } else {
        this.panel.hide();
        this.robot.setProbe(false);
      }
    }
    this.activeAmt = damp(this.activeAmt, this.active ? 1 : 0, 4, dt);
    this.uniforms.uActiveAmt.value = this.activeAmt;
    if (!this.active && this.activeAmt < 0.01) this.uniforms.uActive.value = -1;

    if (this.active) {
      this.focus.set(this.active.fx, 1.1, this.active.fz);
      if (this.robot.speed < 0.4) this.robot.faceTowards(this.active.fx, this.active.fz, dt);
      this.robot.lookX = damp(this.robot.lookX, 0, 4, dt);
    } else {
      // les yeux suivent la direction du mouvement
      const v = this.robot.velocity;
      const side = (v.x * Math.cos(this.robot.heading) - v.z * Math.sin(this.robot.heading)) / 4;
      this.robot.lookX = damp(this.robot.lookX, Math.max(-1, Math.min(1, side)), 5, dt);
    }
  }

  private tick = () => {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    this.uniforms.uTime.value = this.time;

    this.input.vector(this.move);
    const impact = this.robot.step(dt, this.move, this.input.boost, this.physics);
    if (impact > 2.5) this.rig.shake(impact * 0.025);
    this.room.setRobot(this.robot.position.x, this.robot.position.z);

    this.updateInteraction(dt);
    this.racks.update(dt);

    this.rig.update(
      dt,
      this.robot.position,
      this.robot.velocity,
      this.active ? this.focus : null,
      this.panel.isOpen,
      this.compact,
    );
    this.renderer.render(this.scene, this.rig.camera);
  };
}
