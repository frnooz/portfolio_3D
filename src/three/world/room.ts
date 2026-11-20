import * as THREE from 'three';
import type { Layout } from './layout';
import type { SharedUniforms } from './racks';

export interface FloorUniforms {
  uRobot: { value: THREE.Vector2 };
  uPing: { value: THREE.Vector3 }; // x, z, rayon
  uPingAmt: { value: number };
  uCold: { value: THREE.Vector4[] };
  uHot: { value: THREE.Vector4 };
}

/**
 * Sol technique (dalles de 60 cm) dessiné en shader :
 * joints, dalles perforées bleutées dans les allées froides, allée chaude orangée,
 * halo sous le robot et onde de « ping ».
 */
function floorMaterial(shared: SharedUniforms, fu: FloorUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: '#14191e', roughness: 0.62, metalness: 0.25 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, fu);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform float uTime;
        uniform float uPowerRadius;
        uniform vec2 uPowerOrigin;
        uniform vec2 uRobot;
        uniform vec3 uPing;
        uniform float uPingAmt;
        uniform vec4 uCold[2];
        uniform vec4 uHot;
        float fh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float inRect(vec2 p, vec4 r){ return step(r.x, p.x) * step(p.x, r.y) * step(r.z, p.y) * step(p.y, r.w); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 fp = vWPos.xz;
        vec2 tile = fp / 0.6;
        vec2 cell = floor(tile);
        vec2 g = abs(fract(tile) - 0.5);
        float seam = 1.0 - (1.0 - smoothstep(0.47, 0.5, g.x)) * (1.0 - smoothstep(0.47, 0.5, g.y));
        float var = fh(cell) * 0.06 - 0.03;
        float cold = max(inRect(fp, uCold[0]), inRect(fp, uCold[1]));
        float hot = inRect(fp, uHot);
        // dalles perforées : deux rangées devant chaque façade (là où l'air froid est aspiré)
        float perfTile = cold * step(fp.y, uCold[0].z + 1.2) * step(uCold[0].z, fp.y)
                       + cold * step(fp.y, uCold[1].z + 1.2) * step(uCold[1].z, fp.y);
        vec2 hp = fract(tile * 8.0) - 0.5;
        float holes = perfTile * (1.0 - smoothstep(0.18, 0.26, length(hp))) * step(max(g.x, g.y), 0.44);
        diffuseColor.rgb += var;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.03, 0.035), seam * 0.85);
        diffuseColor.rgb *= 1.0 - holes * 0.55;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float power = smoothstep(uPowerRadius, uPowerRadius - 3.0, distance(fp, uPowerOrigin));
          // air froid qui remonte des dalles perforées
          totalEmissiveRadiance += vec3(0.04, 0.16, 0.24) * holes * (0.45 + 0.25 * sin(uTime * 1.3 + cell.x * 0.7)) * power;
          totalEmissiveRadiance += vec3(0.004, 0.012, 0.018) * cold * power;
          // allée chaude : lueur orangée
          totalEmissiveRadiance += vec3(0.022, 0.006, 0.002) * hot * (1.0 - seam * 0.6) * power;
          // halo du robot
          float dr = distance(fp, uRobot);
          totalEmissiveRadiance += vec3(0.25, 0.75, 0.95) * exp(-dr * dr * 2.2) * 0.55;
          totalEmissiveRadiance += vec3(0.25, 0.75, 0.95) * seam * exp(-dr * 1.1) * 0.6;
          // ping : anneau qui balaie la salle et révèle le quadrillage
          float dp = distance(fp, uPing.xy);
          float ring = exp(-pow((dp - uPing.z) * 3.0, 2.0)) * uPingAmt;
          totalEmissiveRadiance += vec3(0.36, 0.88, 1.0) * (ring * 0.9 + ring * seam * 3.0);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'floor-v1';
  return mat;
}

/** Béton sombre avec joints de banches et bande de sécurité au pied. */
function wallMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: '#101418', roughness: 0.9, metalness: 0.05 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos2;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvWPos2 = (modelMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos2;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float u = abs(vNormal.x) > 0.5 ? vWPos2.z : vWPos2.x;
          float panel = step(0.985, fract(u / 2.4)) + step(0.99, fract(vWPos2.y / 1.5));
          diffuseColor.rgb *= 1.0 - clamp(panel, 0.0, 1.0) * 0.45;
          // bande jaune/noire au pied du mur
          float band = step(vWPos2.y, 0.32) * step(0.12, vWPos2.y);
          float stripes = step(0.5, fract((u + vWPos2.y) * 2.2));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.03), vec3(0.55, 0.38, 0.05), stripes), band * 0.9);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'wall-v1';
  return mat;
}

export class Room {
  readonly group = new THREE.Group();
  readonly floorUniforms: FloorUniforms;

  constructor(layout: Layout, shared: SharedUniforms) {
    const { minX, maxX, minZ, maxZ } = layout.room;
    const W = maxX - minX;
    const D = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    this.floorUniforms = {
      uRobot: { value: new THREE.Vector2() },
      uPing: { value: new THREE.Vector3(0, 0, 0) },
      uPingAmt: { value: 0 },
      uCold: {
        value: [
          // allée A (devant les projets) et allée B (devant les compétences)
          new THREE.Vector4(-layout.rowHalf, layout.rowHalf, -6.55, -2.0),
          new THREE.Vector4(-layout.rowHalf, layout.rowHalf, -0.55, 3.0),
        ],
      },
      uHot: { value: new THREE.Vector4(-layout.rowHalf - 1, layout.rowHalf + 1, minZ + 0.3, -7.9) },
    };

    // dalle de faux-plancher : épaisse, on voit sa tranche au sud (effet maquette en coupe)
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, D), floorMaterial(shared, this.floorUniforms));
    slab.position.set(cx, -0.25, cz);
    this.group.add(slab);

    // vide technique sous le plancher : plots + câbles visibles sur la tranche
    const plenum = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.04, 0.6, D - 0.04),
      new THREE.MeshStandardMaterial({ color: '#07090b', roughness: 1 }),
    );
    plenum.position.set(cx, -0.8, cz);
    this.group.add(plenum);

    const wallMat = wallMaterial();
    const H = 4.0;
    const T = 0.35;
    const walls: [number, number, number, number, number][] = [
      // x, z, largeur, profondeur, hauteur au-dessus du sol
      [cx, minZ - T / 2, W + T * 2, T, H], // nord
      [minX - T / 2, cz, T, D, H], // ouest
      [maxX + T / 2, cz, T, D, H], // est
      // sud : muret « en coupe », ouvert sur l'entrée
      [(minX - T - 1.4) / 2, maxZ + T / 2, -1.4 - (minX - T), T, 0.42],
      [(maxX + T + 1.4) / 2, maxZ + T / 2, maxX + T - 1.4, T, 0.42],
    ];
    for (const [x, z, w, d, top] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, top + 0.5, d), wallMat);
      m.position.set(x, (top - 0.5) / 2, z);
      this.group.add(m);
    }

    // seuil d'entrée lumineux
    const threshold = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.02, 0.12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ce1ff').multiplyScalar(2), toneMapped: false }),
    );
    threshold.position.set(0, 0.01, maxZ + 0.05);
    this.group.add(threshold);
  }

  setRobot(x: number, z: number) {
    this.floorUniforms.uRobot.value.set(x, z);
  }
}
