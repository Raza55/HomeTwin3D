import { PBRMaterial, Material, type AbstractMesh } from '@babylonjs/core';
export const isWindowGlassName=(name:string)=>/^(Wohnzimmer_Fensterglas_klar|Film_B37_Fenster_Klarglas|SZ_Neues_Fensterglas|SZ_Fenster_Klarglas)(?:$|\.)/.test(name);
/** Window panes transmit daylight; frames, walls and cover panels remain shadow casters. */
export function prepareWindowGlass(mesh:AbstractMesh):boolean {
 const mat=mesh.material;
 if(!mat || !isWindowGlassName(mat.name))return false;
 if(mat instanceof PBRMaterial){mat.alpha=.12;mat.transparencyMode=Material.MATERIAL_ALPHABLEND;mat.metallic=0;mat.roughness=.08;mat.backFaceCulling=false;mat.subSurface.isRefractionEnabled=false;}
 mesh.metadata={...mesh.metadata,windowGlass:true};mesh.receiveShadows=false;
 return true;
}
/**
 * Refractive glass (KHR_materials_transmission) makes Babylon render the whole
 * opaque scene into an extra texture on every view change (~8 ms per frame in
 * close-ups). Alpha-blended glass looks nearly the same for these small parts
 * and costs nothing extra. Transparency follows the authored transmission.
 */
export function simplifyRefractiveGlass(mesh:AbstractMesh):boolean {
 const mat=mesh.material;
 if(!(mat instanceof PBRMaterial) || !mat.subSurface.isRefractionEnabled || isWindowGlassName(mat.name))return false;
 const transmission=Math.min(1,Math.max(0,mat.subSurface.refractionIntensity));
 mat.subSurface.isRefractionEnabled=false;
 mat.alpha=Math.min(mat.alpha,Math.max(.14,1-transmission*.86));
 mat.transparencyMode=Material.MATERIAL_ALPHABLEND;
 mat.metallic=0;
 mat.subSurface.refractionTexture=null;
 mat.metadata={...mat.metadata,simpleGlass:true};
 // The glTF transmission helper only re-sorts a mesh on a material change event;
 // without it the mesh stays in its refraction list and keeps the extra pass alive.
 mesh.onMaterialChangedObservable.notifyObservers(mesh);
 return true;
}
