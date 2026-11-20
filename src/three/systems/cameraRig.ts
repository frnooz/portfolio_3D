import * as THREE from 'three';
import { damp } from '../core/math';

/**
 * Caméra 3/4 façon maquette : angle fixe (pas de mal de mer), suit le robot avec
 * un léger temps de retard, anticipe sa direction, se rapproche quand une baie est ouverte.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly dir = new THREE.Vector3(0, 1.45, 1).normalize();
  private distance = 15;
  private baseDistance = 15;
  private zoom = 1;
  private shakeAmt = 0;
  private t = 0;
  /** Décalage écran quand le panneau latéral est ouvert (en mètres monde). */
  private sideShift = 0;
  private sideTarget = 0;
  /** Override cinématique (intro) : 0 = rig normal, 1 = pose libre. */
  cinematic = 0;
  readonly cinePos = new THREE.Vector3();
  readonly cineLook = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(34, aspect, 0.5, 120);
  }

  resize(w: number, h: number) {
    const aspect = w / h;
    this.camera.aspect = aspect;
    // portrait : on recule pour garder la largeur de l'allée à l'écran
    this.baseDistance = aspect < 1 ? 17 + (1 - aspect) * 16 : aspect < 1.4 ? 18 : 17;
    this.camera.updateProjectionMatrix();
  }

  snap(to: THREE.Vector3) {
    this.target.copy(to);
    this.distance = this.baseDistance * this.zoom;
    this.camera.position.copy(this.target).addScaledVector(this.dir, this.distance);
    this.camera.lookAt(this.target);
  }

  shake(amount: number) {
    this.shakeAmt = Math.min(0.35, this.shakeAmt + amount);
  }

  /** `focus` : point d'intérêt (baie ouverte), `side` : panneau ouvert à droite. */
  update(dt: number, robot: THREE.Vector3, vel: THREE.Vector3, focus: THREE.Vector3 | null, side: boolean, compact: boolean) {
    this.t += dt;
    this.desired.copy(robot).addScaledVector(vel, 0.28);
    this.desired.y = 0.6;
    if (focus) {
      this.desired.lerp(focus, 0.35);
      this.desired.y = 0.9;
    }
    this.zoom = damp(this.zoom, focus ? (compact ? 0.86 : 0.78) : 1, 2.5, dt);
    this.sideTarget = side ? 1 : 0;
    this.sideShift = damp(this.sideShift, this.sideTarget, 3, dt);

    this.target.x = damp(this.target.x, this.desired.x, 3.2, dt);
    this.target.y = damp(this.target.y, this.desired.y, 3.2, dt);
    this.target.z = damp(this.target.z, this.desired.z, 3.2, dt);
    this.distance = damp(this.distance, this.baseDistance * this.zoom, 2.5, dt);

    const cam = this.camera;
    cam.position.copy(this.target).addScaledVector(this.dir, this.distance);
    // panneau à droite (desktop) : on décale le cadre pour garder la baie visible à gauche
    // panneau en bas (mobile) : on remonte le sujet dans le haut de l'écran
    const look = this.look.copy(this.target);
    if (compact) {
      look.z += this.sideShift * 1.6;
      cam.position.z += this.sideShift * 1.6;
    } else {
      look.x += this.sideShift * 2.1;
      cam.position.x += this.sideShift * 2.1;
    }

    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt;
      cam.position.x += Math.sin(this.t * 61) * s * 0.3;
      cam.position.y += Math.sin(this.t * 53 + 1) * s * 0.3;
      this.shakeAmt = damp(this.shakeAmt, 0, 9, dt);
    }

    if (this.cinematic > 0.0001) {
      cam.position.lerp(this.cinePos, this.cinematic);
      look.lerp(this.cineLook, this.cinematic);
    }
    cam.lookAt(look);
  }
}
