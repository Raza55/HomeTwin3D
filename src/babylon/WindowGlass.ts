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
