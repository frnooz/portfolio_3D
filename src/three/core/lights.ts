import * as THREE from 'three';

/**
 * Coût des PointLight borné à leur portée.
 * three r187 évalue chaque PointLight (GGX + Fresnel + atténuation) sur TOUS les fragments éclairés.
 * Au-delà de `distance`, sa fenêtre (1 - (d/r)^4)^2 vaut exactement 0 : on saute le calcul.
 * Image identique ; la lampe du robot (4 m) et la lumière du legacy (7 m) ne coûtent plus rien ailleurs.
 * Module à effet de bord : importé avant toute compilation de shader.
 * Ne jamais masquer/ajouter une lumière en cours de visite (NUM_POINT_LIGHTS → tout recompile) : intensité 0.
 */
const ASSIGN = 'pointLight = pointLights[ i ];';
const CALL = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const src = THREE.ShaderChunk.lights_fragment_begin;
const a = src.indexOf(ASSIGN);
const c = src.indexOf(CALL, a);
if (a >= 0 && c > a && c < src.indexOf('#pragma unroll_loop_end', a)) {
  const d2 = 'dot( pointLight.position - geometryPosition, pointLight.position - geometryPosition )';
  THREE.ShaderChunk.lights_fragment_begin =
    src.slice(0, a) +
    // aucune déclaration dans le corps : l'unroll de three le recopie tel quel (redéclaration sinon)
    `${ASSIGN}\n\t\tif ( pointLight.distance <= 0.0 || ${d2} < pointLight.distance * pointLight.distance ) {\n\t\t` +
    src.slice(a + ASSIGN.length, c + CALL.length) +
    '\n\t\t}' +
    src.slice(c + CALL.length);
} else {
  console.warn('[lights] chunk three inattendu : portée des PointLight non optimisée');
}
