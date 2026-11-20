import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FONT_DISPLAY, FONT_MONO, textTexture } from '../core/screen';
import { LEGACY, NOC, PROJECT_ROW_Z, RACK, SKILL_ROW_Z, type Layout } from './layout';
import type { SharedUniforms } from './racks';
import type { Physics } from '../systems/physics';
import { boxFromCenter } from '../systems/physics';

/** Peigne de brassage : câbles de couleur qui descendent entre les baies. */
function patchTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c0f12';
  g.fillRect(0, 0, 64, 256);
  const cols = ['#2f86c9', '#e7c64a', '#2fbf71', '#d9534f', '#8a9aa6', '#2f86c9', '#e7c64a'];
  for (let i = 0; i < 9; i++) {
    g.fillStyle = cols[i % cols.length];
    const x = 6 + i * 6;
    g.fillRect(x, 0, 4, 256);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x + 3, 0, 1, 256);
  }
  g.fillStyle = '#1a2026';
  for (let y = 10; y < 256; y += 32) g.fillRect(0, y, 64, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fibre jaune dans les chemins de câbles, avec des impulsions de données. */
function fiberMaterial(u: SharedUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#8a6d16', roughness: 0.6, metalness: 0.1 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFW = (modelMatrix * vec4(position, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFW;\nuniform float uTime;\nuniform float uPowerRadius;\nuniform vec2 uPowerOrigin;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float pw = smoothstep(uPowerRadius, uPowerRadius - 3.0, distance(vFW.xz, uPowerOrigin));
        float lane = floor(vFW.z * 6.0);
        float pulse = smoothstep(0.9, 1.0, fract(vFW.x * 0.12 - uTime * (0.35 + fract(lane * 0.37) * 0.3) + lane * 0.29));
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.2) * pulse * 1.3 * pw;`,
      );
  };
  m.customProgramCacheKey = () => 'fiber-v1';
  return m;
}

export class Decor {
  readonly group = new THREE.Group();

  constructor(layout: Layout, uniforms: SharedUniforms, physics: Physics) {
    const { room, rowHalf } = layout;

    // ── peignes de brassage entre les baies projet ──
    if (layout.managers.length) {
      const geo = new THREE.BoxGeometry(0.36, RACK.h - 0.05, RACK.d - 0.2);
      geo.translate(0, (RACK.h - 0.05) / 2, 0);
      const mesh = new THREE.InstancedMesh(
        geo,
        [
          new THREE.MeshStandardMaterial({ color: '#111519', roughness: 0.6, metalness: 0.4 }),
          new THREE.MeshStandardMaterial({ color: '#111519', roughness: 0.6, metalness: 0.4 }),
          new THREE.MeshStandardMaterial({ color: '#111519', roughness: 0.6, metalness: 0.4 }),
          new THREE.MeshStandardMaterial({ color: '#111519', roughness: 0.6, metalness: 0.4 }),
          new THREE.MeshStandardMaterial({ map: patchTexture(), roughness: 0.7 }),
          new THREE.MeshStandardMaterial({ color: '#111519', roughness: 0.6, metalness: 0.4 }),
        ],
        layout.managers.length,
      );
      const m = new THREE.Matrix4();
      layout.managers.forEach((p, i) => {
        m.makeTranslation(p.x, 0, p.z);
        mesh.setMatrixAt(i, m);
      });
      this.group.add(mesh);
    }

    // ── chemins de câbles au plafond + fibre jaune ──
    const trayParts: THREE.BufferGeometry[] = [];
    const fiberParts: THREE.BufferGeometry[] = [];
    const len = rowHalf * 2 + 0.6;
    for (const z of [PROJECT_ROW_Z, SKILL_ROW_Z]) {
      const y = RACK.h + 0.55;
      const base = new THREE.BoxGeometry(len, 0.03, 0.6);
      base.translate(0, y, z);
      const l = new THREE.BoxGeometry(len, 0.14, 0.03);
      l.translate(0, y + 0.07, z - 0.3);
      const r = new THREE.BoxGeometry(len, 0.14, 0.03);
      r.translate(0, y + 0.07, z + 0.3);
      trayParts.push(base, l, r);
      for (let k = 0; k < 3; k++) {
        const f = new THREE.CylinderGeometry(0.035, 0.035, len, 6);
        f.rotateZ(Math.PI / 2);
        f.translate(0, y + 0.05, z - 0.16 + k * 0.16);
        fiberParts.push(f);
      }
      // descentes de fibre dans chaque baie de la rangée
      for (const rack of layout.racks) {
        if (Math.abs(rack.z - z) > 0.01) continue;
        const d = new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6);
        d.translate(rack.x + 0.25, RACK.h + 0.3, z - 0.2);
        fiberParts.push(d);
      }
      // suspentes
      for (let x = -rowHalf; x <= rowHalf; x += 2.4) {
        const rod = new THREE.CylinderGeometry(0.012, 0.012, 1.4, 4);
        rod.translate(x, y + 0.7, z);
        trayParts.push(rod);
      }
    }
    const trays = new THREE.Mesh(
      mergeGeometries(trayParts)!,
      new THREE.MeshStandardMaterial({ color: '#2a3138', roughness: 0.5, metalness: 0.7 }),
    );
    this.group.add(trays);
    this.group.add(new THREE.Mesh(mergeGeometries(fiberParts)!, fiberMaterial(uniforms)));

    // ── climatiseurs de précision (CRAC) le long des murs ──
    const cracGeo = new THREE.BoxGeometry(0.9, 2.1, 2.0);
    cracGeo.translate(0, 1.05, 0);
    const grille = document.createElement('canvas');
    grille.width = 128;
    grille.height = 256;
    const gg = grille.getContext('2d')!;
    gg.fillStyle = '#c9ced3';
    gg.fillRect(0, 0, 128, 256);
    gg.fillStyle = '#5c646b';
    for (let y = 70; y < 246; y += 7) gg.fillRect(10, y, 108, 3);
    gg.fillStyle = '#0b1418';
    gg.fillRect(14, 16, 64, 36);
    gg.fillStyle = '#5ce1ff';
    gg.font = `600 20px ${FONT_MONO}`;
    gg.fillText('18.4°', 20, 42);
    gg.fillStyle = '#39e58c';
    gg.beginPath();
    gg.arc(100, 34, 6, 0, Math.PI * 2);
    gg.fill();
    const grilleTex = new THREE.CanvasTexture(grille);
    grilleTex.colorSpace = THREE.SRGBColorSpace;
    const cracSide = new THREE.MeshStandardMaterial({ color: '#b9bec3', roughness: 0.6, metalness: 0.2 });
    const cracFront = new THREE.MeshStandardMaterial({ map: grilleTex, roughness: 0.6, metalness: 0.2 });
    const cracZs = [-4.6, 1.6];
    for (const side of [-1, 1]) {
      for (const z of cracZs) {
        const x = side < 0 ? room.minX + 0.5 : room.maxX - 0.5;
        // la face « avant » (+x local) regarde l'intérieur de la salle
        const mats = side < 0
          ? [cracFront, cracSide, cracSide, cracSide, cracSide, cracSide]
          : [cracSide, cracFront, cracSide, cracSide, cracSide, cracSide];
        const crac = new THREE.Mesh(cracGeo, mats);
        crac.position.set(x, 0, z);
        this.group.add(crac);
        physics.add(boxFromCenter(x, z, 0.95, 2.05));
      }
    }

    // ── marquages au sol (peinture jaune usée) ──
    const paint = (text: string, sub: string, x: number, z: number, w: number) => {
      const tex = textTexture(
        [
          { text, font: `800 92px ${FONT_DISPLAY}`, color: '#e9d48a', y: 62, x: 8 },
          { text: sub, font: `500 40px ${FONT_MONO}`, color: '#e9d48a', y: 140, x: 12 },
        ],
        1024,
        176,
      );
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const h = (w * 176) / 1024;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x + w / 2, 0.006, z);
      m.renderOrder = 1;
      this.group.add(m);
    };
    const left = -rowHalf - 0.2;
    paint('ALLÉE A', 'PROJETS · allée froide', left, PROJECT_ROW_Z + RACK.d / 2 + 2.6, 3.6);
    paint('ALLÉE B', 'COMPÉTENCES · allée froide', left, SKILL_ROW_Z + RACK.d / 2 + 2.1, 3.6);
    paint('NOC', 'À PROPOS · supervision', NOC.x + NOC.w / 2 + 0.6, NOC.z + 0.2, 3.0);
    paint('LEGACY', 'CV · allée chaude', LEGACY.x + LEGACY.w / 2 + 0.7, LEGACY.z + 1.4, 3.0);

    // bandes de délimitation des allées
    const stripeMat = new THREE.MeshBasicMaterial({ color: '#e9d48a', transparent: true, opacity: 0.22, depthWrite: false });
    for (const z of [PROJECT_ROW_Z + RACK.d / 2 + 0.25, SKILL_ROW_Z + RACK.d / 2 + 0.25]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(rowHalf * 2 + 0.6, 0.05), stripeMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(0, 0.005, z);
      this.group.add(s);
    }
  }
}
