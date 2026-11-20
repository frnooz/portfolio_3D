import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Fusionne plusieurs meshes statiques (même matériau) en un seul, transformations « cuites »
 * dans la géométrie → un seul draw call au lieu de N.
 * Les meshes d'origine sont retirés de la scène ; le mesh fusionné est ajouté à `into`.
 */
export function bakeMerge(meshes: THREE.Mesh[], into: THREE.Object3D, material: THREE.Material): THREE.Mesh {
  into.updateMatrixWorld(true);
  const inv = into.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  const geos = meshes.map((mesh) => {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry.index ? mesh.geometry.clone() : mesh.geometry.clone();
    g.applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld));
    mesh.removeFromParent();
    return g;
  });
  const merged = new THREE.Mesh(mergeGeometries(geos)!, material);
  into.add(merged);
  return merged;
}
