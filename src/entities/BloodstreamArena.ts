import * as THREE from 'three';
import {
  ARENA_MAPS,
  ARENA_RADIUS,
  ARENA_VERTICAL_LIMIT,
  GRAPHICS_PRESETS,
  REGION_POWER_UPS,
} from '../constants';
import {
  ArenaMapId,
  ArenaMapSpec,
  GraphicsPresetConfig,
  GraphicsQuality,
  NutrientKind,
  RegionPowerUpId,
} from '../types';

export interface NutrientInstance {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  kind: NutrientKind;
  energyValue: number;
  scoreValue: number;
  scale: number;
  phase: number;
}

export interface ObstacleCluster {
  position: THREE.Vector3;
  radius: number;
  mesh: THREE.Group;
}

export interface RegionPowerUpInstance {
  active: boolean;
  powerUpId: RegionPowerUpId;
  position: THREE.Vector3;
  respawnTimer: number;
  phase: number;
  mesh: THREE.Group;
  coreMesh: THREE.Object3D;
  ringGroup: THREE.Group;
}

const _dummyObj = new THREE.Object3D();
const _tempVec = new THREE.Vector3();
const _color = new THREE.Color();

/**
 * Generates a procedural organic tissue wall texture in SRGBColorSpace.
 */
function createEndothelialWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.5, '#d4d4d8');
  grad.addColorStop(1, '#a1a1aa');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Organic striated collagen & capillary ridges
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 36; i++) {
    ctx.beginPath();
    const yBase = (i / 36) * 512;
    ctx.moveTo(0, yBase);
    for (let x = 0; x <= 512; x += 32) {
      const wave = Math.sin(x * 0.03 + i) * 12;
      ctx.lineTo(x, yBase + wave);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 6);
  return tex;
}

/**
 * Creates a true biconcave erythrocyte (Red Blood Cell) geometry using LatheGeometry.
 */
function createBiconcaveRbcGeometry(): THREE.LatheGeometry {
  const points: THREE.Vector2[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI;
    const x = Math.sin(t) * 1.35;
    const rNorm = Math.sin(t);
    const dimple = 0.28 + 0.42 * Math.pow(rNorm, 2) - 0.2 * Math.pow(rNorm, 4);
    const y = Math.cos(t) * dimple;
    points.push(new THREE.Vector2(x, y));
  }
  const geo = new THREE.LatheGeometry(points, 24);
  geo.computeVertexNormals();
  return geo;
}

export class BloodstreamArena extends THREE.Group {
  private preset: GraphicsPresetConfig;
  public currentMapId: ArenaMapId;
  public currentMapSpec: ArenaMapSpec;
  private wallTexture: THREE.CanvasTexture;
  private vesselWallMesh!: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  private vesselFloorCap!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
  private vesselCeilingCap!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;

  // Instanced Ambient Organ Cells / Red Blood Cells
  private rbcInstanced!: THREE.InstancedMesh;
  private rbcMat!: THREE.MeshStandardMaterial;
  private rbcData: { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; scale: number }[] = [];

  // Instanced ATP/Glucose Nutrients & Oxygen Particles
  private nutrientInstanced!: THREE.InstancedMesh;
  private chemotaxisHaloInstanced!: THREE.InstancedMesh;
  private oxygenInstanced!: THREE.InstancedMesh;
  public nutrients: NutrientInstance[] = [];

  // Collection particle bursts (pooled InstancedMesh)
  private burstInstanced!: THREE.InstancedMesh;
  private burstParticles: {
    active: boolean;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    life: number;
    maxLife: number;
  }[] = [];

  // Environmental Organ Landmarks & Obstacles
  public obstacles: ObstacleCluster[] = [];
  private obstaclesGroup = new THREE.Group();

  // Region-Specific Biological Power-Ups (spawn only in their designated organ)
  public regionPowerUps: RegionPowerUpInstance[] = [];
  private powerUpsGroup = new THREE.Group();

  private elapsedTime = 0;

  constructor(
    quality: GraphicsQuality = GraphicsQuality.MEDIUM,
    mapId: ArenaMapId = ArenaMapId.HEART,
  ) {
    super();
    this.name = 'BloodstreamArena';
    this.preset = GRAPHICS_PRESETS[quality];
    this.currentMapId = mapId;
    this.currentMapSpec = ARENA_MAPS[mapId] || ARENA_MAPS[ArenaMapId.HEART];
    this.wallTexture = createEndothelialWallTexture();

    this.buildVesselWalls();
    this.buildObstacles();
    this.buildRegionPowerUps();
    this.buildInstancedPools();
  }

  public setArenaMap(mapId: ArenaMapId): void {
    const spec = ARENA_MAPS[mapId];
    if (!spec) return;
    this.currentMapId = mapId;
    this.currentMapSpec = spec;

    if (this.vesselWallMesh) {
      this.vesselWallMesh.material.color.setHex(spec.wallColor);
      this.vesselWallMesh.material.emissive.setHex(spec.wallEmissive);
    }
    if (this.vesselFloorCap) {
      this.vesselFloorCap.material.color.setHex(spec.capColor);
      this.vesselFloorCap.material.emissive.setHex(spec.wallEmissive);
    }
    if (this.rbcMat) {
      this.rbcMat.color.setHex(spec.cellColor);
      this.rbcMat.emissive.setHex(spec.cellEmissive);
    }

    this.buildObstacles();
    this.buildRegionPowerUps();
  }

  private buildVesselWalls(): void {
    const spec = this.currentMapSpec;
    const wallGeo = new THREE.CylinderGeometry(
      ARENA_RADIUS + 4,
      ARENA_RADIUS + 4,
      ARENA_VERTICAL_LIMIT * 2.5,
      this.preset.vesselSegments,
      10,
      true,
    );
    const wallMat = new THREE.MeshStandardMaterial({
      map: this.wallTexture,
      color: spec.wallColor,
      emissive: spec.wallEmissive,
      emissiveIntensity: 0.45,
      roughness: 0.65,
      metalness: 0.08,
      side: THREE.BackSide,
    });
    this.vesselWallMesh = new THREE.Mesh(wallGeo, wallMat);
    this.add(this.vesselWallMesh);

    const capGeo = new THREE.CircleGeometry(ARENA_RADIUS + 4, this.preset.vesselSegments);
    const capMat = new THREE.MeshStandardMaterial({
      color: spec.capColor,
      emissive: spec.wallEmissive,
      emissiveIntensity: 0.32,
      roughness: 0.78,
      side: THREE.DoubleSide,
    });

    this.vesselFloorCap = new THREE.Mesh(capGeo, capMat);
    this.vesselFloorCap.rotation.x = -Math.PI / 2;
    this.vesselFloorCap.position.y = -ARENA_VERTICAL_LIMIT - 2.0;

    this.vesselCeilingCap = new THREE.Mesh(capGeo, capMat);
    this.vesselCeilingCap.rotation.x = Math.PI / 2;
    this.vesselCeilingCap.position.y = ARENA_VERTICAL_LIMIT + 2.0;

    this.add(this.vesselFloorCap, this.vesselCeilingCap);
  }

  private buildObstacles(): void {
    while (this.obstaclesGroup.children.length > 0) {
      this.obstaclesGroup.remove(this.obstaclesGroup.children[0]);
    }
    this.obstacles = [];

    const spec = this.currentMapSpec;
    const coreMat = new THREE.MeshStandardMaterial({
      color: spec.obstacleCoreColor,
      emissive: spec.obstacleCoreColor,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.15,
    });
    const strandMat = new THREE.MeshStandardMaterial({
      color: spec.obstacleStrandColor,
      emissive: spec.obstacleStrandColor,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.1,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: spec.obstacleAccentColor,
      emissive: spec.obstacleAccentColor,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    });

    // 32 large organ-specific anatomical structures distributed across the 10x map
    const clusterCount = 32;
    for (let i = 0; i < clusterCount; i++) {
      const ringIndex = Math.floor(i / 8); // 4 concentric rings across the 10x arena
      const angle = ((i % 8) / 8) * Math.PI * 2 + ringIndex * 0.42;
      const dist = 24 + ringIndex * 78 + (i % 3) * 14;
      const pos = new THREE.Vector3(
        Math.cos(angle) * dist,
        ((i % 5) - 2) * 5.5,
        Math.sin(angle) * dist,
      );
      const radius = 3.2 + (i % 3) * 0.9;

      const group = new THREE.Group();
      group.position.copy(pos);

      if (this.currentMapId === ArenaMapId.PANCREAS) {
        // PANCREAS ISLETS: Beta-Cell Islet of Langerhans Cluster + Golden Insulin Duct Rings
        const isletCore = new THREE.Mesh(
          new THREE.DodecahedronGeometry(radius * 0.85, 1),
          coreMat,
        );
        const ductRing = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 1.15, 0.24, 12, 28),
          strandMat,
        );
        ductRing.rotation.x = Math.PI / 2.4;
        group.add(isletCore, ductRing);
        for (let b = 0; b < 5; b++) {
          const betaCell = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 0.34, 12, 10),
            b % 2 === 0 ? accentMat : strandMat,
          );
          const a = (b / 5) * Math.PI * 2;
          betaCell.position.set(
            Math.cos(a) * radius * 0.9,
            ((b % 3) - 1) * 1.4,
            Math.sin(a) * radius * 0.9,
          );
          group.add(betaCell);
        }
      } else if (this.currentMapId === ArenaMapId.BRAIN) {
        // BRAIN CORTEX: Synaptic Axon Pillar + Glowing Soma Node + Dendrite Rings
        const axonPillar = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 0.32, radius * 0.42, 26, 12),
          coreMat,
        );
        const somaNode = new THREE.Mesh(
          new THREE.OctahedronGeometry(radius * 0.85, 2),
          strandMat,
        );
        const synapseRing = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 1.15, 0.22, 10, 28),
          accentMat,
        );
        synapseRing.rotation.x = Math.PI / 3;
        group.add(axonPillar, somaNode, synapseRing);
      } else if (this.currentMapId === ArenaMapId.LIVER) {
        // LIVER SINUSOID: Hexagonal Hepatic Lobule Column + Bile Crystal Clusters
        const hexColumn = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 0.75, radius * 0.75, 16, 6),
          coreMat,
        );
        group.add(hexColumn);
        for (let c = 0; c < 4; c++) {
          const crystal = new THREE.Mesh(
            new THREE.OctahedronGeometry(radius * 0.42, 0),
            c % 2 === 0 ? strandMat : accentMat,
          );
          const a = (c / 4) * Math.PI * 2;
          crystal.position.set(Math.cos(a) * radius * 0.85, (c - 1.5) * 1.8, Math.sin(a) * radius * 0.85);
          group.add(crystal);
        }
      } else if (this.currentMapId === ArenaMapId.INTESTINE) {
        // INTESTINE VILLI: Towering Finger-Like Mucosal Villi + Brush-Border Rings
        const villusFinger = new THREE.Mesh(
          new THREE.CapsuleGeometry(radius * 0.58, 18, 12, 18),
          coreMat,
        );
        const ring1 = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 0.75, 0.2, 10, 24),
          strandMat,
        );
        ring1.rotation.x = Math.PI / 2;
        ring1.position.y = 3.5;
        const ring2 = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 0.75, 0.2, 10, 24),
          accentMat,
        );
        ring2.rotation.x = Math.PI / 2;
        ring2.position.y = -3.5;
        group.add(villusFinger, ring1, ring2);
      } else if (this.currentMapId === ArenaMapId.HEART) {
        // HEART VENTRICLE: Cardiac Trabeculae Muscle Pillar + Chordae Tendineae Arch
        const musclePillar = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 0.48, radius * 0.68, 22, 14),
          coreMat,
        );
        const valveArch = new THREE.Mesh(
          new THREE.TorusKnotGeometry(radius * 0.72, 0.24, 36, 8, 2, 3),
          strandMat,
        );
        group.add(musclePillar, valveArch);
      } else {
        // BLOODSTREAM: Fibrin Clot Group + Trapped Platelets
        const coreMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(radius * 0.72, 1), coreMat);
        group.add(coreMesh);
        for (let s = 0; s < 3; s++) {
          const ringGeo = new THREE.TorusKnotGeometry(radius * 0.65, 0.18, 36, 8, 2, 3);
          const strand = new THREE.Mesh(ringGeo, strandMat);
          strand.rotation.set(s * 1.1, s * 0.8, s * 0.5);
          group.add(strand);
        }
        for (let p = 0; p < 3; p++) {
          const pGeo = new THREE.IcosahedronGeometry(0.45, 1);
          const pMesh = new THREE.Mesh(pGeo, accentMat);
          const a = (p / 3) * Math.PI * 2;
          pMesh.position.set(
            Math.cos(a) * (radius * 0.85),
            (p - 1) * 0.65,
            Math.sin(a) * (radius * 0.85),
          );
          group.add(pMesh);
        }
      }

      this.obstaclesGroup.add(group);
      this.obstacles.push({ position: pos, radius, mesh: group });
    }

    this.add(this.obstaclesGroup);
  }

  /**
   * Builds 8 Organ-Specific Biological Power-Up nodes that spawn exclusively in this organ.
   */
  private buildRegionPowerUps(): void {
    while (this.powerUpsGroup.children.length > 0) {
      this.powerUpsGroup.remove(this.powerUpsGroup.children[0]);
    }
    this.regionPowerUps = [];

    const powerUpId = this.currentMapSpec.powerUpId;
    const pSpec = REGION_POWER_UPS[powerUpId];

    const coreMat = new THREE.MeshStandardMaterial({
      color: pSpec.coreColor,
      emissive: pSpec.coreColor,
      emissiveIntensity: 1.05,
      roughness: 0.15,
      metalness: 0.3,
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: pSpec.ringColor,
      emissive: pSpec.ringColor,
      emissiveIntensity: 0.95,
      roughness: 0.2,
      metalness: 0.2,
    });
    const beaconMat = new THREE.MeshBasicMaterial({
      color: pSpec.coreColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });

    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.35;
      const dist = 18 + (i % 4) * 19;
      const pos = new THREE.Vector3(
        Math.cos(angle) * dist,
        ((i % 3) - 1) * 2.2,
        Math.sin(angle) * dist,
      );

      const mesh = new THREE.Group();
      mesh.position.copy(pos);

      const coreGroup = new THREE.Group();
      const ringGroup = new THREE.Group();

      if (powerUpId === RegionPowerUpId.INSULIN_RUSH) {
        // Pancreas: Glowing Insulin Hexamer Crystal Capsule + Beta-Cell Speed Rings
        const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.95, 10, 16), coreMat);
        capsule.rotation.z = Math.PI / 4;
        const hexCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.88, 0), ringMat);
        coreGroup.add(capsule, hexCore);
      } else if (powerUpId === RegionPowerUpId.IRON_CORE) {
        // Liver: Heavy Ferritin Octahedron Core + Interlocking Iron Armor Bands
        const ironOcta = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 1), coreMat);
        const innerCube = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), ringMat);
        innerCube.rotation.set(Math.PI / 4, Math.PI / 4, 0);
        coreGroup.add(ironOcta, innerCube);
      } else if (powerUpId === RegionPowerUpId.DOPAMINE_SURGE) {
        // Brain: Electric Synaptic Vesicle + Neurotransmitter Star Nodes
        const vesicle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.92, 1), coreMat);
        coreGroup.add(vesicle);
        for (let s = 0; s < 4; s++) {
          const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), ringMat);
          const a = (s / 4) * Math.PI * 2;
          spark.position.set(Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15);
          coreGroup.add(spark);
        }
      } else if (powerUpId === RegionPowerUpId.ADRENALINE_PULSE) {
        // Heart: Pulsing Cardiac Epinephrine Crystal
        const heartCrystal = new THREE.Mesh(
          new THREE.TorusKnotGeometry(0.65, 0.22, 40, 10, 2, 3),
          coreMat,
        );
        coreGroup.add(heartCrystal);
      } else if (powerUpId === RegionPowerUpId.ENZYME_BLOOM) {
        // Intestine: Catalytic Enzyme Helix
        const helix = new THREE.Mesh(
          new THREE.TorusKnotGeometry(0.68, 0.2, 36, 8, 3, 2),
          coreMat,
        );
        coreGroup.add(helix);
      } else {
        // Bloodstream: Hemoglobin 4-Subunit Oxygen Tetramer Cluster
        for (let t = 0; t < 4; t++) {
          const heme = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 12), t % 2 === 0 ? coreMat : ringMat);
          const a = (t / 4) * Math.PI * 2;
          heme.position.set(Math.cos(a) * 0.52, (t % 2 === 0 ? 0.25 : -0.25), Math.sin(a) * 0.52);
          coreGroup.add(heme);
        }
      }

      // Dual Rotating Orbital Rings around every Region Power-Up
      const orbit1 = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.09, 10, 28), ringMat);
      orbit1.rotation.x = Math.PI / 3;
      const orbit2 = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.07, 10, 28), coreMat);
      orbit2.rotation.y = Math.PI / 3;
      ringGroup.add(orbit1, orbit2);

      // Horizontal Floor Beacon Ring for high visibility at a distance
      const beaconRing = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.2, 28), beaconMat);
      beaconRing.rotation.x = -Math.PI / 2;
      beaconRing.position.y = -1.1;

      mesh.add(coreGroup, ringGroup, beaconRing);
      this.powerUpsGroup.add(mesh);

      this.regionPowerUps.push({
        active: true,
        powerUpId,
        position: pos,
        respawnTimer: 0,
        phase: i * 0.9,
        mesh,
        coreMesh: coreGroup,
        ringGroup,
      });
    }

    this.add(this.powerUpsGroup);
  }

  public consumeRegionPowerUp(powerUp: RegionPowerUpInstance): void {
    powerUp.active = false;
    powerUp.respawnTimer = 10.5;
    powerUp.mesh.visible = false;
    this.spawnCollectionBurst(powerUp.position);
  }

  private respawnRegionPowerUpAround(powerUp: RegionPowerUpInstance, centerPos: THREE.Vector3): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 68;
    powerUp.position.set(
      THREE.MathUtils.clamp(centerPos.x + Math.cos(angle) * dist, -(ARENA_RADIUS - 12), ARENA_RADIUS - 12),
      (Math.random() - 0.5) * 14,
      THREE.MathUtils.clamp(centerPos.z + Math.sin(angle) * dist, -(ARENA_RADIUS - 12), ARENA_RADIUS - 12),
    );
    powerUp.mesh.position.copy(powerUp.position);
    powerUp.active = true;
    powerUp.respawnTimer = 0;
    powerUp.mesh.visible = true;
  }

  private buildInstancedPools(): void {
    if (this.rbcInstanced) {
      this.remove(
        this.rbcInstanced,
        this.nutrientInstanced,
        this.chemotaxisHaloInstanced,
        this.oxygenInstanced,
        this.burstInstanced,
      );
      this.rbcInstanced.geometry.dispose();
      this.nutrientInstanced.geometry.dispose();
      this.chemotaxisHaloInstanced.geometry.dispose();
      this.oxygenInstanced.geometry.dispose();
      this.burstInstanced.geometry.dispose();
    }

    const spec = this.currentMapSpec;

    // 1. Ambient Organ Cells / Red Blood Cells (InstancedMesh)
    const rbcGeo = createBiconcaveRbcGeometry();
    this.rbcMat = new THREE.MeshStandardMaterial({
      color: spec.cellColor,
      emissive: spec.cellEmissive,
      emissiveIntensity: 0.35,
      roughness: 0.32,
      metalness: 0.08,
    });
    this.rbcInstanced = new THREE.InstancedMesh(rbcGeo, this.rbcMat, this.preset.rbcCount);
    this.rbcInstanced.frustumCulled = false;
    this.rbcData = [];

    for (let i = 0; i < this.preset.rbcCount; i++) {
      const r = 6 + Math.random() * 135;
      const theta = Math.random() * Math.PI * 2;
      const pos = new THREE.Vector3(
        Math.cos(theta) * r,
        (Math.random() - 0.5) * 42,
        Math.sin(theta) * r,
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.5) * 0.5,
        1.6 + Math.random() * 2.2,
      );
      const rot = new THREE.Euler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      const scale = 0.95 + Math.random() * 0.65;
      this.rbcData.push({ pos, vel, rot, scale });
    }
    this.add(this.rbcInstanced);

    // 2. ATP/Glucose Nutrients & Oxygen Particles
    this.nutrients = [];
    const totalNutrients = this.preset.nutrientCount;
    const totalOxygen = this.preset.oxygenCount;

    const nutGeo = new THREE.OctahedronGeometry(0.48, 1);
    const nutMat = new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      emissive: 0x22c55e,
      emissiveIntensity: 0.85,
      roughness: 0.18,
      metalness: 0.1,
    });
    this.nutrientInstanced = new THREE.InstancedMesh(nutGeo, nutMat, totalNutrients);
    this.nutrientInstanced.frustumCulled = false;

    const haloGeo = new THREE.RingGeometry(0.68, 0.95, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
    });
    this.chemotaxisHaloInstanced = new THREE.InstancedMesh(haloGeo, haloMat, totalNutrients);
    this.chemotaxisHaloInstanced.frustumCulled = false;

    for (let i = 0; i < totalNutrients; i++) {
      const isRich = i % 6 === 0;
      const nut = this.createNutrientEntry(
        isRich ? NutrientKind.AMINO_CLUSTER : NutrientKind.ATP_GLUCOSE,
      );
      this.nutrients.push(nut);
      _color.setHex(isRich ? 0xfacc15 : 0x4ade80);
      this.nutrientInstanced.setColorAt(i, _color);
    }
    if (this.nutrientInstanced.instanceColor) {
      this.nutrientInstanced.instanceColor.needsUpdate = true;
    }

    const oxyGeo = new THREE.SphereGeometry(0.34, 12, 10);
    const oxyMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.9,
      roughness: 0.15,
    });
    this.oxygenInstanced = new THREE.InstancedMesh(oxyGeo, oxyMat, totalOxygen);
    this.oxygenInstanced.frustumCulled = false;

    for (let i = 0; i < totalOxygen; i++) {
      this.nutrients.push(this.createNutrientEntry(NutrientKind.OXYGEN));
    }

    // 3. Collection Burst Pool
    const burstGeo = new THREE.DodecahedronGeometry(0.18, 0);
    const burstMat = new THREE.MeshBasicMaterial({
      color: 0xa7f3d0,
      transparent: true,
      opacity: 0.9,
    });
    this.burstInstanced = new THREE.InstancedMesh(burstGeo, burstMat, 96);
    this.burstInstanced.frustumCulled = false;
    this.burstParticles = [];
    for (let i = 0; i < 96; i++) {
      this.burstParticles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.45,
      });
      _dummyObj.scale.setScalar(0);
      _dummyObj.updateMatrix();
      this.burstInstanced.setMatrixAt(i, _dummyObj.matrix);
    }

    this.add(
      this.nutrientInstanced,
      this.chemotaxisHaloInstanced,
      this.oxygenInstanced,
      this.burstInstanced,
    );
  }

  private createNutrientEntry(kind: NutrientKind): NutrientInstance {
    // Distribute across a wide 125m radius around origin and stream with the player as they explore the 10x map
    const r = 4 + Math.random() * 120;
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 32;
    return {
      active: true,
      position: new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.9,
      ),
      kind,
      energyValue:
        kind === NutrientKind.AMINO_CLUSTER ? 24 : kind === NutrientKind.OXYGEN ? 18 : 13,
      scoreValue:
        kind === NutrientKind.AMINO_CLUSTER ? 45 : kind === NutrientKind.OXYGEN ? 25 : 15,
      scale: kind === NutrientKind.AMINO_CLUSTER ? 1.4 : 1.05,
      phase: Math.random() * Math.PI * 2,
    };
  }

  public respawnNutrient(
    nut: NutrientInstance,
    difficultyMultiplier = 1.0,
    aroundPos?: THREE.Vector3,
  ): void {
    const minR = Math.min(14, 4 + (difficultyMultiplier - 1) * 3);
    const r = minR + Math.random() * 95;
    const angle = Math.random() * Math.PI * 2;
    const baseX = aroundPos ? aroundPos.x : 0;
    const baseZ = aroundPos ? aroundPos.z : 0;
    nut.position.set(
      THREE.MathUtils.clamp(baseX + Math.cos(angle) * r, -(ARENA_RADIUS - 8), ARENA_RADIUS - 8),
      (Math.random() - 0.5) * 28,
      THREE.MathUtils.clamp(baseZ + Math.sin(angle) * r, -(ARENA_RADIUS - 8), ARENA_RADIUS - 8),
    );
    nut.active = true;
  }

  public spawnCollectionBurst(pos: THREE.Vector3): void {
    let spawned = 0;
    for (let i = 0; i < this.burstParticles.length && spawned < 10; i++) {
      const p = this.burstParticles[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(pos);
        p.vel.set(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
        );
        p.life = 0;
        p.maxLife = 0.35 + Math.random() * 0.2;
        spawned++;
      }
    }
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    if (this.preset.quality === quality) return;
    this.preset = GRAPHICS_PRESETS[quality];
    this.buildInstancedPools();
  }

  public findNearestNutrient(fromPos: THREE.Vector3): THREE.Vector3 | null {
    let bestDistSq = Infinity;
    let bestPos: THREE.Vector3 | null = null;
    for (let i = 0; i < this.nutrients.length; i++) {
      const n = this.nutrients[i];
      if (!n.active) continue;
      const dSq = fromPos.distanceToSquared(n.position);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestPos = n.position;
      }
    }
    return bestPos;
  }

  public updateArena(
    dt: number,
    playerPos: THREE.Vector3,
    isChemotaxisActive: boolean,
    cameraPos: THREE.Vector3,
    isEnzymeBloomActive = false,
  ): void {
    this.elapsedTime += dt;
    const flowMult = this.currentMapSpec.flowSpeed / 2.0;

    // 1. Rhythmic peristaltic/systolic pulse on organ wall
    const wallPulse = 1.0 + Math.sin(this.elapsedTime * 2.1 * flowMult) * 0.012;
    this.vesselWallMesh.scale.set(wallPulse, 1.0, wallPulse);
    this.wallTexture.offset.y = (this.elapsedTime * 0.03 * flowMult) % 1;

    // 2. Gently animate organ landmarks
    for (let i = 0; i < this.obstacles.length; i++) {
      const obs = this.obstacles[i];
      obs.mesh.rotation.y += dt * 0.18;
      obs.mesh.rotation.x = Math.sin(this.elapsedTime * 0.7 + i) * 0.08;
    }

    // 3. Update Ambient Organ Cells / Red Blood Cells InstancedMesh
    for (let i = 0; i < this.rbcData.length; i++) {
      const rbc = this.rbcData[i];
      rbc.pos.addScaledVector(rbc.vel, dt * flowMult);
      rbc.rot.x += dt * 0.55;
      rbc.rot.z += dt * 0.42;

      // Stream cells within 135m of the player as they travel across the 10x organ map
      if (rbc.pos.distanceToSquared(playerPos) > 135 * 135) {
        const angle = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 105;
        rbc.pos.set(
          THREE.MathUtils.clamp(playerPos.x + Math.cos(angle) * r, -(ARENA_RADIUS - 8), ARENA_RADIUS - 8),
          (Math.random() - 0.5) * 40,
          THREE.MathUtils.clamp(playerPos.z + Math.sin(angle) * r, -(ARENA_RADIUS - 8), ARENA_RADIUS - 8),
        );
      }

      _dummyObj.position.copy(rbc.pos);
      _dummyObj.rotation.copy(rbc.rot);
      _dummyObj.scale.setScalar(rbc.scale);
      _dummyObj.updateMatrix();
      this.rbcInstanced.setMatrixAt(i, _dummyObj.matrix);
    }
    this.rbcInstanced.instanceMatrix.needsUpdate = true;

    // 4. Update Nutrients, Chemotaxis / Enzyme Bloom Attraction & Oxygen Particles
    const nutTotal = this.preset.nutrientCount;
    const hasMagneticPull = isChemotaxisActive || isEnzymeBloomActive;
    const pullRadius = isEnzymeBloomActive ? 35.0 : 22.0;
    const pullSpeed = isEnzymeBloomActive ? 13.5 : 9.5;
    for (let i = 0; i < this.nutrients.length; i++) {
      const n = this.nutrients[i];
      n.position.addScaledVector(n.velocity, dt);
      n.position.y += Math.sin(this.elapsedTime * 2.2 + n.phase) * 0.008;

      // Stream nutrients around the player as they explore the 10x map
      if (n.position.distanceToSquared(playerPos) > 125 * 125) {
        this.respawnNutrient(n, 1.0, playerPos);
      }

      // Keep inside 10x arena wall
      if (n.position.length() > ARENA_RADIUS - 4) {
        n.velocity.negate();
        n.position.clampLength(0, ARENA_RADIUS - 5);
      }

      // Chemotaxis or Enzyme Bloom magnetic pull toward player
      if (hasMagneticPull) {
        const distToPlayer = n.position.distanceTo(playerPos);
        if (distToPlayer < pullRadius && distToPlayer > 0.2) {
          _tempVec.subVectors(playerPos, n.position).normalize();
          n.position.addScaledVector(_tempVec, dt * pullSpeed);
        }
      }

      const bobScale = n.scale * (0.9 + Math.sin(this.elapsedTime * 3.8 + n.phase) * 0.14);
      _dummyObj.position.copy(n.position);
      _dummyObj.rotation.set(this.elapsedTime * 1.4, this.elapsedTime * 1.8, 0);
      _dummyObj.scale.setScalar(n.active ? bobScale : 0);
      _dummyObj.updateMatrix();

      if (i < nutTotal) {
        this.nutrientInstanced.setMatrixAt(i, _dummyObj.matrix);

        // Chemotaxis / Enzyme Bloom highlight beacon ring
        if (hasMagneticPull && n.active) {
          _dummyObj.lookAt(cameraPos);
          const ringPulse = 1.2 + Math.sin(this.elapsedTime * 8 + i) * 0.25;
          _dummyObj.scale.setScalar(ringPulse);
        } else {
          _dummyObj.scale.setScalar(0);
        }
        _dummyObj.updateMatrix();
        this.chemotaxisHaloInstanced.setMatrixAt(i, _dummyObj.matrix);
      } else {
        const oxyIdx = i - nutTotal;
        this.oxygenInstanced.setMatrixAt(oxyIdx, _dummyObj.matrix);
      }
    }
    this.nutrientInstanced.instanceMatrix.needsUpdate = true;
    this.chemotaxisHaloInstanced.instanceMatrix.needsUpdate = true;
    this.oxygenInstanced.instanceMatrix.needsUpdate = true;

    // 5. Update Organ-Specific Region Power-Ups (animation, cooldown respawn, and 10x map streaming)
    for (let i = 0; i < this.regionPowerUps.length; i++) {
      const p = this.regionPowerUps[i];
      if (!p.active) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          this.respawnRegionPowerUpAround(p, playerPos);
        }
        continue;
      }

      // Stream power-ups if player moves far across the 10x map
      if (p.position.distanceToSquared(playerPos) > 115 * 115) {
        this.respawnRegionPowerUpAround(p, playerPos);
      }

      p.mesh.position.y = p.position.y + Math.sin(this.elapsedTime * 2.8 + p.phase) * 0.42;
      const pulse = 1.0 + Math.sin(this.elapsedTime * 4.5 + p.phase) * 0.1;
      p.coreMesh.scale.setScalar(pulse);
      p.coreMesh.rotation.y += dt * 1.6;
      p.coreMesh.rotation.x += dt * 0.9;
      p.ringGroup.rotation.z -= dt * 2.1;
      p.ringGroup.rotation.x += dt * 1.2;
    }

    // 6. Update Burst Particles
    let burstDirty = false;
    for (let i = 0; i < this.burstParticles.length; i++) {
      const p = this.burstParticles[i];
      if (!p.active) continue;
      burstDirty = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _dummyObj.scale.setScalar(0);
      } else {
        p.pos.addScaledVector(p.vel, dt);
        const s = (1 - p.life / p.maxLife) * 1.25;
        _dummyObj.position.copy(p.pos);
        _dummyObj.scale.setScalar(s);
      }
      _dummyObj.updateMatrix();
      this.burstInstanced.setMatrixAt(i, _dummyObj.matrix);
    }
    if (burstDirty) {
      this.burstInstanced.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.wallTexture.dispose();
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
