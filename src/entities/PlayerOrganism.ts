import * as THREE from 'three';
import { ORGANISM_STRAINS } from '../constants';
import { OrganismStrain } from '../types';

const _tempDir = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _upVec = new THREE.Vector3(0, 1, 0);
const _lookMat = new THREE.Matrix4();

/**
 * Generates a procedural cellular membrane bump/albedo CanvasTexture with SRGBColorSpace.
 */
function createCellularTexture(primaryHex: number, secondaryHex: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const c1 = new THREE.Color(primaryHex);
  const c2 = new THREE.Color(secondaryHex);

  const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 128);
  grad.addColorStop(0, `#${c1.getHexString()}`);
  grad.addColorStop(1, `#${c2.getHexString()}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle organic lipid-raft voronoi-like vesicles
  for (let i = 0; i < 48; i++) {
    const x = (Math.sin(i * 73.1) * 0.5 + 0.5) * 256;
    const y = (Math.cos(i * 41.7) * 0.5 + 0.5) * 256;
    const r = 6 + (i % 5) * 4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export class PlayerOrganism extends THREE.Group {
  public strain: OrganismStrain;
  public velocity = new THREE.Vector3();
  public heading = new THREE.Vector3(0, 0, -1);

  // Core anatomical components
  private bodyGroup: THREE.Group;
  private cellMembraneMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private cytoplasmMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private nucleusGroup: THREE.Group;
  private nucleusMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private nucleolusMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private mitochondriaGroup: THREE.Group;
  private mitochondriaMeshes: THREE.Group[] = [];
  private flagellaGroup: THREE.Group;
  private flagellaMeshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];

  // Ability visual attachments
  private shieldMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private chemotaxisRing: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private boostSlipstream: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  // Binary Fission helper clone
  public fissionClone: THREE.Group;
  public fissionCloneActive = false;
  public fissionClonePosition = new THREE.Vector3();
  private fissionCloneVel = new THREE.Vector3();

  // Animation states
  private elapsedTime = 0;
  private currentSize = 1.0;
  private targetSize = 1.0;
  private growthPulseTimer = 0;
  private damageFlashTimer = 0;
  private deathProgress = 0;
  public isDead = false;

  private isSoftwareGl: boolean;
  private membraneTexture: THREE.CanvasTexture;

  constructor(strainId: string = ORGANISM_STRAINS[0].id, isSoftwareGl = false) {
    super();
    this.name = 'PlayerOrganism';
    this.isSoftwareGl = isSoftwareGl;
    this.strain = ORGANISM_STRAINS.find((s) => s.id === strainId) || ORGANISM_STRAINS[0];
    this.membraneTexture = createCellularTexture(
      this.strain.membraneColor,
      this.strain.cytoplasmColor,
    );

    this.bodyGroup = new THREE.Group();
    this.nucleusGroup = new THREE.Group();
    this.mitochondriaGroup = new THREE.Group();
    this.flagellaGroup = new THREE.Group();
    this.fissionClone = new THREE.Group();

    // 1. Cytoplasm (Inner Gel Volume)
    const cytoGeo = new THREE.IcosahedronGeometry(0.82, 3);
    cytoGeo.scale(1.0, 0.88, 1.18);
    const cytoMat = new THREE.MeshStandardMaterial({
      color: this.strain.cytoplasmColor,
      emissive: this.strain.cytoplasmColor,
      emissiveIntensity: 0.22,
      roughness: 0.55,
      metalness: 0.05,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.cytoplasmMesh = new THREE.Mesh(cytoGeo, cytoMat);
    this.cytoplasmMesh.renderOrder = 2;
    this.bodyGroup.add(this.cytoplasmMesh);

    // 2. Nucleus & Nucleolus (Central Genetic Core)
    const nucGeo = new THREE.SphereGeometry(0.36, 24, 20);
    const nucMat = new THREE.MeshStandardMaterial({
      color: this.strain.nucleusColor,
      emissive: this.strain.nucleusColor,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.15,
      map: this.membraneTexture,
    });
    this.nucleusMesh = new THREE.Mesh(nucGeo, nucMat);
    this.nucleusMesh.castShadow = !this.isSoftwareGl;

    const nucleolusGeo = new THREE.IcosahedronGeometry(0.16, 2);
    const nucleolusMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: this.strain.nucleusColor,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    this.nucleolusMesh = new THREE.Mesh(nucleolusGeo, nucleolusMat);
    this.nucleusGroup.add(this.nucleusMesh, this.nucleolusMesh);

    // Endoplasmic reticulum / perinuclear halo rings
    const erGeo = new THREE.TorusGeometry(0.44, 0.035, 10, 32);
    const erMat = new THREE.MeshStandardMaterial({
      color: this.strain.nucleusColor,
      emissive: this.strain.cytoplasmColor,
      emissiveIntensity: 0.3,
      roughness: 0.4,
    });
    const erRing1 = new THREE.Mesh(erGeo, erMat);
    erRing1.rotation.x = Math.PI * 0.38;
    const erRing2 = new THREE.Mesh(erGeo, erMat);
    erRing2.rotation.y = Math.PI * 0.42;
    this.nucleusGroup.add(erRing1, erRing2);
    this.bodyGroup.add(this.nucleusGroup);

    // 3. Mitochondria (Cristae-banded ATP organelles)
    this.buildMitochondria();
    this.bodyGroup.add(this.mitochondriaGroup);

    // 4. Cell Membrane (Outer Phospholipid Bilayer)
    const memGeo = new THREE.IcosahedronGeometry(1.0, 4);
    memGeo.scale(1.0, 0.88, 1.24);
    const memMat = new THREE.MeshPhysicalMaterial({
      color: this.strain.membraneColor,
      emissive: this.strain.cytoplasmColor,
      emissiveIntensity: 0.18,
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
      transmission: this.isSoftwareGl ? 0 : 0.68,
      thickness: 0.9,
      ior: 1.38,
      transparent: true,
      opacity: this.isSoftwareGl ? 0.46 : 0.86,
      depthWrite: false,
      map: this.membraneTexture,
    });
    this.cellMembraneMesh = new THREE.Mesh(memGeo, memMat);
    this.cellMembraneMesh.renderOrder = 4;
    this.bodyGroup.add(this.cellMembraneMesh);

    // 5. Flagella (Posterior Helical Filaments + Basal Motors)
    this.buildFlagella();
    this.bodyGroup.add(this.flagellaGroup);

    // 6. Ability Visual Effects
    const shieldGeo = new THREE.IcosahedronGeometry(1.36, 2);
    shieldGeo.scale(1.02, 0.94, 1.25);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 0.75,
      wireframe: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.visible = false;
    this.bodyGroup.add(this.shieldMesh);

    const chemoGeo = new THREE.RingGeometry(1.4, 1.65, 48);
    chemoGeo.rotateX(-Math.PI / 2);
    const chemoMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.chemotaxisRing = new THREE.Mesh(chemoGeo, chemoMat);
    this.chemotaxisRing.visible = false;
    this.add(this.chemotaxisRing);

    const slipGeo = new THREE.ConeGeometry(0.95, 2.6, 20, 1, true);
    slipGeo.rotateX(-Math.PI / 2);
    slipGeo.translate(0, 0, 1.5);
    const slipMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.boostSlipstream = new THREE.Mesh(slipGeo, slipMat);
    this.boostSlipstream.visible = false;
    this.bodyGroup.add(this.boostSlipstream);

    this.add(this.bodyGroup);

    // Build Binary Fission Clone Organism
    this.buildFissionClone();
  }

  private buildMitochondria(): void {
    // Clear existing
    while (this.mitochondriaGroup.children.length > 0) {
      this.mitochondriaGroup.remove(this.mitochondriaGroup.children[0]);
    }
    this.mitochondriaMeshes = [];

    const capsuleGeo = new THREE.CapsuleGeometry(0.11, 0.2, 8, 12);
    const mitoMat = new THREE.MeshStandardMaterial({
      color: this.strain.mitochondriaColor,
      emissive: this.strain.mitochondriaColor,
      emissiveIntensity: 0.5,
      roughness: 0.35,
      metalness: 0.1,
    });
    const cristaeGeo = new THREE.TorusGeometry(0.112, 0.018, 6, 16);
    const cristaeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: this.strain.mitochondriaColor,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });

    const count = this.strain.mitochondriaCount;
    for (let i = 0; i < count; i++) {
      const mGroup = new THREE.Group();
      const body = new THREE.Mesh(capsuleGeo, mitoMat);
      const band1 = new THREE.Mesh(cristaeGeo, cristaeMat);
      band1.position.y = 0.06;
      band1.rotation.x = Math.PI / 2;
      const band2 = new THREE.Mesh(cristaeGeo, cristaeMat);
      band2.position.y = -0.06;
      band2.rotation.x = Math.PI / 2;
      mGroup.add(body, band1, band2);

      const angle = (i / count) * Math.PI * 2;
      const radius = 0.56;
      mGroup.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle * 2) * 0.18,
        Math.sin(angle) * (radius * 1.15),
      );
      mGroup.rotation.set(angle * 0.7, angle, Math.PI * 0.25);
      this.mitochondriaGroup.add(mGroup);
      this.mitochondriaMeshes.push(mGroup);
    }
  }

  private buildFlagella(): void {
    while (this.flagellaGroup.children.length > 0) {
      this.flagellaGroup.remove(this.flagellaGroup.children[0]);
    }
    this.flagellaMeshes = [];

    const flagMat = new THREE.MeshStandardMaterial({
      color: this.strain.flagellaColor,
      emissive: this.strain.flagellaColor,
      emissiveIntensity: 0.38,
      roughness: 0.28,
      metalness: 0.2,
    });

    const basalGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.12, 12);
    basalGeo.rotateX(Math.PI / 2);
    const basalMat = new THREE.MeshStandardMaterial({
      color: this.strain.nucleusColor,
      roughness: 0.25,
      metalness: 0.6,
    });

    const count = this.strain.flagellaCount;
    for (let i = 0; i < count; i++) {
      const offsetSpread = count === 1 ? 0 : ((i / (count - 1)) - 0.5) * 0.55;
      const yOffset = (i % 2 === 0 ? 1 : -1) * 0.1;

      // Basal body motor ring at posterior cell pole (+Z in local organism space)
      const basalMotor = new THREE.Mesh(basalGeo, basalMat);
      basalMotor.position.set(offsetSpread, yOffset, 1.16);
      this.flagellaGroup.add(basalMotor);

      // Helical curve points
      const curvePoints: THREE.Vector3[] = [];
      const segments = 18;
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const amp = t * 0.22;
        curvePoints.push(
          new THREE.Vector3(
            offsetSpread + Math.sin(t * Math.PI * 3 + i) * amp,
            yOffset + Math.cos(t * Math.PI * 3 + i) * amp,
            1.18 + t * 1.95,
          ),
        );
      }
      const curve = new THREE.CatmullRomCurve3(curvePoints);
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.042, 8, false);
      const flagMesh = new THREE.Mesh(tubeGeo, flagMat);
      flagMesh.userData = { offsetSpread, yOffset, index: i };
      this.flagellaGroup.add(flagMesh);
      this.flagellaMeshes.push(flagMesh);
    }
  }

  private buildFissionClone(): void {
    const cloneMemGeo = new THREE.IcosahedronGeometry(0.65, 3);
    cloneMemGeo.scale(1.0, 0.88, 1.2);
    const cloneMemMat = new THREE.MeshStandardMaterial({
      color: 0xc084fc,
      emissive: 0x9333ea,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      transparent: true,
      opacity: 0.72,
    });
    const cloneNucGeo = new THREE.SphereGeometry(0.24, 16, 14);
    const cloneNucMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 0.8,
    });
    const cloneRingGeo = new THREE.TorusGeometry(0.78, 0.03, 8, 24);
    cloneRingGeo.rotateX(Math.PI / 2);
    const cloneRingMat = new THREE.MeshBasicMaterial({
      color: 0xe879f9,
      transparent: true,
      opacity: 0.65,
    });

    this.fissionClone.add(
      new THREE.Mesh(cloneMemGeo, cloneMemMat),
      new THREE.Mesh(cloneNucGeo, cloneNucMat),
      new THREE.Mesh(cloneRingGeo, cloneRingMat),
    );
    this.fissionClone.visible = false;
  }

  public setStrain(strainId: string): void {
    const found = ORGANISM_STRAINS.find((s) => s.id === strainId);
    if (!found) return;
    this.strain = found;

    this.membraneTexture.dispose();
    this.membraneTexture = createCellularTexture(
      this.strain.membraneColor,
      this.strain.cytoplasmColor,
    );

    this.cellMembraneMesh.material.color.setHex(this.strain.membraneColor);
    this.cellMembraneMesh.material.emissive.setHex(this.strain.cytoplasmColor);
    this.cellMembraneMesh.material.map = this.membraneTexture;
    this.cellMembraneMesh.material.needsUpdate = true;

    this.cytoplasmMesh.material.color.setHex(this.strain.cytoplasmColor);
    this.cytoplasmMesh.material.emissive.setHex(this.strain.cytoplasmColor);

    this.nucleusMesh.material.color.setHex(this.strain.nucleusColor);
    this.nucleusMesh.material.emissive.setHex(this.strain.nucleusColor);
    this.nucleusMesh.material.map = this.membraneTexture;

    this.buildMitochondria();
    this.buildFlagella();
  }

  public resetForNewGame(): void {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.heading.set(0, 0, -1);
    this.rotation.set(0, 0, 0);
    this.currentSize = 1.0;
    this.targetSize = 1.0;
    this.growthPulseTimer = 0;
    this.damageFlashTimer = 0;
    this.deathProgress = 0;
    this.isDead = false;
    this.scale.setScalar(1.0);
    this.fissionCloneActive = false;
    this.fissionClone.visible = false;
    this.shieldMesh.visible = false;
    this.chemotaxisRing.visible = false;
    this.boostSlipstream.visible = false;
  }

  public triggerDamageAnimation(): void {
    this.damageFlashTimer = 0.45;
  }

  public triggerGrowthAnimation(newTargetSize: number): void {
    const clamped = Math.max(1.0, Math.min(2.25, newTargetSize));
    if (clamped > this.targetSize + 0.04) {
      this.growthPulseTimer = 0.55;
    }
    this.targetSize = clamped;
  }

  public triggerDeathAnimation(): void {
    this.isDead = true;
    this.deathProgress = 0.001;
  }

  public getCollisionRadius(): number {
    return 1.05 * this.currentSize;
  }

  public updateOrganism(
    dt: number,
    isSprinting: boolean,
    isFlagellaBoostActive: boolean,
    isShieldActive: boolean,
    isChemotaxisActive: boolean,
    isBinaryFissionActive: boolean,
    nearestNutrientPos: THREE.Vector3 | null,
  ): void {
    this.elapsedTime += dt;

    // 1. Death animation (membrane lysis contraction & dispersal)
    if (this.isDead) {
      this.deathProgress = Math.min(1, this.deathProgress + dt * 1.4);
      const shrink = Math.max(0.05, 1 - this.deathProgress * 0.75);
      this.bodyGroup.scale.setScalar(shrink);
      this.bodyGroup.rotation.y += dt * 5.0;
      this.bodyGroup.rotation.z += dt * 3.2;
      this.cellMembraneMesh.material.emissive.setHex(0xef4444);
      this.cellMembraneMesh.material.emissiveIntensity = 0.9 * (1 - this.deathProgress);
      return;
    }

    // 2. Smooth Growth interpolation + harmonic bounce
    this.currentSize = THREE.MathUtils.damp(this.currentSize, this.targetSize, 5.0, dt);
    let growthScaleBoost = 1.0;
    if (this.growthPulseTimer > 0) {
      this.growthPulseTimer = Math.max(0, this.growthPulseTimer - dt);
      growthScaleBoost = 1.0 + Math.sin(this.growthPulseTimer * Math.PI * 4) * 0.16;
    }
    this.scale.setScalar(this.currentSize * growthScaleBoost);

    // 3. Heading orientation & hydrodynamic squash-and-stretch
    const speedLen = this.velocity.length();
    if (speedLen > 0.15) {
      _tempDir.copy(this.velocity).normalize();
      this.heading.lerp(_tempDir, 1 - Math.exp(-10 * dt)).normalize();
      _lookMat.lookAt(this.position, _tempDir.add(this.position), _upVec);
      _targetQuat.setFromRotationMatrix(_lookMat);
      this.bodyGroup.quaternion.slerp(_targetQuat, 1 - Math.exp(-12 * dt));
    }

    // Idle vs Movement vs Sprint deformation
    const fastFactor = isFlagellaBoostActive ? 1.35 : isSprinting ? 1.18 : 1.0;
    const breathWave = Math.sin(this.elapsedTime * 3.2) * 0.04;
    const stretchZ = 1.0 + Math.min(0.28, (speedLen / 16) * 0.22 * fastFactor) + breathWave;
    const squashXY = 1.0 / Math.sqrt(stretchZ);
    this.bodyGroup.scale.set(squashXY, squashXY, stretchZ);

    // 4. Organelle Internal Animations (Nucleus & Mitochondria)
    this.nucleusGroup.rotation.y = this.elapsedTime * 0.65;
    this.nucleusGroup.rotation.z = Math.sin(this.elapsedTime * 1.4) * 0.25;
    const nucPulse = 1.0 + Math.sin(this.elapsedTime * 4.5) * 0.06;
    this.nucleolusMesh.scale.setScalar(nucPulse);

    for (let i = 0; i < this.mitochondriaMeshes.length; i++) {
      const m = this.mitochondriaMeshes[i];
      const baseAngle = (i / this.mitochondriaMeshes.length) * Math.PI * 2 + this.elapsedTime * 0.45;
      const r = 0.54;
      m.position.x = Math.cos(baseAngle) * r;
      m.position.y = Math.sin(baseAngle * 2 + this.elapsedTime) * 0.16;
      m.position.z = Math.sin(baseAngle) * (r * 1.12);
      m.rotation.x += dt * (isSprinting || isFlagellaBoostActive ? 2.4 : 0.9);
      m.rotation.y += dt * 1.1;
    }

    // 5. Flagella Whip Animation (scales frequency and amplitude with speed & sprint)
    const whipFreq =
      3.5 + speedLen * 1.35 + (isSprinting ? 6.0 : 0) + (isFlagellaBoostActive ? 10.0 : 0);
    const whipAmp = 0.12 + Math.min(0.28, speedLen * 0.022);
    for (let i = 0; i < this.flagellaMeshes.length; i++) {
      const fMesh = this.flagellaMeshes[i];
      const phase = this.elapsedTime * whipFreq + i * 1.6;
      fMesh.rotation.y = Math.sin(phase) * whipAmp;
      fMesh.rotation.x = Math.cos(phase * 0.85) * (whipAmp * 0.75);
      fMesh.scale.z = 1.0 + Math.sin(phase * 2) * 0.08;
    }

    // 6. Damage Flash Feedback
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
      const flash = Math.sin(this.damageFlashTimer * 35) > 0;
      this.cellMembraneMesh.material.emissive.setHex(flash ? 0xff1e42 : this.strain.cytoplasmColor);
      this.cellMembraneMesh.material.emissiveIntensity = flash ? 1.1 : 0.35;
    } else {
      this.cellMembraneMesh.material.emissive.setHex(this.strain.cytoplasmColor);
      this.cellMembraneMesh.material.emissiveIntensity = 0.18;
    }

    // 7. Ability Visual States
    this.shieldMesh.visible = isShieldActive;
    if (isShieldActive) {
      this.shieldMesh.rotation.y -= dt * 1.8;
      this.shieldMesh.rotation.x += dt * 0.9;
      this.shieldMesh.material.opacity = 0.52 + Math.sin(this.elapsedTime * 8) * 0.15;
    }

    this.chemotaxisRing.visible = isChemotaxisActive;
    if (isChemotaxisActive) {
      const sonarPhase = (this.elapsedTime * 1.6) % 1;
      const ringScale = 1.0 + sonarPhase * 6.5;
      this.chemotaxisRing.scale.setScalar(ringScale);
      this.chemotaxisRing.material.opacity = (1 - sonarPhase) * 0.65;
    }

    this.boostSlipstream.visible = isFlagellaBoostActive || isSprinting;
    if (this.boostSlipstream.visible) {
      this.boostSlipstream.material.opacity = isFlagellaBoostActive ? 0.42 : 0.2;
      this.boostSlipstream.rotation.z += dt * 8;
    }

    // 8. Binary Fission Sister Clone AI
    if (isBinaryFissionActive) {
      if (!this.fissionCloneActive) {
        this.fissionCloneActive = true;
        this.fissionClone.visible = true;
        this.fissionClonePosition.copy(this.position).add(new THREE.Vector3(2.2, 0, 0));
        this.fissionCloneVel.set(0, 0, 0);
      }

      const targetPos = nearestNutrientPos || this.position;
      _tempDir.subVectors(targetPos, this.fissionClonePosition);
      const dist = _tempDir.length();
      if (dist > 0.2) {
        _tempDir.normalize().multiplyScalar(13.5);
        this.fissionCloneVel.lerp(_tempDir, 1 - Math.exp(-6 * dt));
      }
      this.fissionClonePosition.addScaledVector(this.fissionCloneVel, dt);
      this.fissionClone.position.copy(this.fissionClonePosition);
      this.fissionClone.rotation.y += dt * 2.5;
    } else {
      this.fissionCloneActive = false;
      this.fissionClone.visible = false;
    }
  }

  public dispose(): void {
    this.membraneTexture.dispose();
    this.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
  }
}
