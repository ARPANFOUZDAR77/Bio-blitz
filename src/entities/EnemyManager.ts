import * as THREE from 'three';
import { ARENA_RADIUS, ARENA_VERTICAL_LIMIT, GRAPHICS_PRESETS } from '../constants';
import { EnemyType, GraphicsQuality } from '../types';
import { NutrientInstance, ObstacleCluster } from './BloodstreamArena';

export interface EnemyEntity {
  id: number;
  type: EnemyType;
  active: boolean;
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  territoryOrigin: THREE.Vector3;
  baseSpeed: number;
  damage: number;
  collisionRadius: number;
  phase: number;
  steerTimer: number;
  targetDirection: THREE.Vector3;
  windupTimer: number;
}

const _dirVec = new THREE.Vector3();
const _avoidVec = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _lookMat = new THREE.Matrix4();
const _targetQuat = new THREE.Quaternion();

export class EnemyManager extends THREE.Group {
  public enemies: EnemyEntity[] = [];
  private maxPoolSize = 30;
  private activeCap = GRAPHICS_PRESETS[GraphicsQuality.MEDIUM].maxEnemies;
  private elapsedTime = 0;

  // Shared materials and geometries for high mobile performance
  private sharedGeometries: THREE.BufferGeometry[] = [];
  private sharedMaterials: THREE.Material[] = [];

  constructor(quality: GraphicsQuality = GraphicsQuality.MEDIUM) {
    super();
    this.name = 'EnemyManager';
    this.activeCap = GRAPHICS_PRESETS[quality].maxEnemies;
    this.initPool();
  }

  private initPool(): void {
    const types = [
      EnemyType.HUNTER,
      EnemyType.WANDERER,
      EnemyType.SCAVENGER,
      EnemyType.DEFENSIVE,
    ];

    for (let i = 0; i < this.maxPoolSize; i++) {
      const type = types[i % types.length];
      const mesh = this.createEnemyCompositeModel(type);
      mesh.visible = false;
      this.add(mesh);

      const pos = new THREE.Vector3();
      const enemy: EnemyEntity = {
        id: i,
        type,
        active: false,
        mesh,
        position: pos,
        velocity: new THREE.Vector3(),
        territoryOrigin: new THREE.Vector3(),
        // Balanced, readable speeds (player organism speed is 10.2 - 12.8)
        baseSpeed:
          type === EnemyType.HUNTER
            ? 3.8
            : type === EnemyType.SCAVENGER
              ? 3.4
              : type === EnemyType.DEFENSIVE
                ? 3.0
                : 2.6,
        damage:
          type === EnemyType.HUNTER
            ? 18
            : type === EnemyType.DEFENSIVE
               ? 22
              : type === EnemyType.SCAVENGER
                ? 12
                : 12,
        collisionRadius: type === EnemyType.DEFENSIVE ? 1.85 : 1.45,
        phase: Math.random() * Math.PI * 2,
        steerTimer: 0,
        targetDirection: new THREE.Vector3(0, 0, 1),
        windupTimer: 0,
      };
      this.enemies.push(enemy);
    }
  }

  /**
   * Builds high-contrast, easily identifiable 3D microorganism models for each enemy archetype
   * with distinct silhouettes, glowing eyes/organelles, and color-coded threat beacon rings.
   */
  private createEnemyCompositeModel(type: EnemyType): THREE.Group {
    const group = new THREE.Group();

    if (type === EnemyType.HUNTER) {
      // 1. HUNTER (NEON CRIMSON PREDATOR): Horned shark-phage body + 2 bright yellow predator eyes + twin pincer mandibles + red threat ring
      const hullGeo = new THREE.ConeGeometry(1.15, 2.9, 16);
      hullGeo.rotateX(Math.PI / 2);
      const hullMat = new THREE.MeshStandardMaterial({
        color: 0xff1e56,
        emissive: 0xe11d48,
        emissiveIntensity: 0.78,
        roughness: 0.2,
        metalness: 0.2,
      });

      const dorsalGeo = new THREE.BoxGeometry(0.18, 0.95, 1.3);
      const eyeGeo = new THREE.SphereGeometry(0.26, 12, 10);
      const eyeMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
      });

      const mandibleGeo = new THREE.ConeGeometry(0.22, 1.05, 10);
      mandibleGeo.rotateX(-Math.PI / 2);
      const mandibleMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xff1e56,
        emissiveIntensity: 0.85,
        roughness: 0.15,
      });

      const ringGeo = new THREE.RingGeometry(1.75, 2.05, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff1e56,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      });

      this.sharedGeometries.push(hullGeo, dorsalGeo, eyeGeo, mandibleGeo, ringGeo);
      this.sharedMaterials.push(hullMat, eyeMat, mandibleMat, ringMat);

      const dorsal = new THREE.Mesh(dorsalGeo, mandibleMat);
      dorsal.position.set(0, 0.78, 0.1);

      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.48, 0.35, -0.75);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.48, 0.35, -0.75);

      const leftMandible = new THREE.Mesh(mandibleGeo, mandibleMat);
      leftMandible.position.set(-0.45, -0.1, -1.55);
      leftMandible.rotation.y = -0.22;

      const rightMandible = new THREE.Mesh(mandibleGeo, mandibleMat);
      rightMandible.position.set(0.45, -0.1, -1.55);
      rightMandible.rotation.y = 0.22;

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = -0.5;

      group.add(
        new THREE.Mesh(hullGeo, hullMat),
        dorsal,
        leftEye,
        rightEye,
        leftMandible,
        rightMandible,
        ring,
      );
    } else if (type === EnemyType.WANDERER) {
      // 2. WANDERER (ELECTRIC CYAN MEDUSA JELLY): High-visibility cyan dome bell + glowing magenta core + 5 trailing tentacles + cyan ring
      const bellGeo = new THREE.SphereGeometry(1.25, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.68);
      bellGeo.rotateX(-Math.PI / 2);
      const bellMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x0284c7,
        emissiveIntensity: 0.75,
        roughness: 0.2,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      });

      const coreGeo = new THREE.SphereGeometry(0.55, 14, 12);
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xf0abfc,
      });

      const tentacleGeo = new THREE.CylinderGeometry(0.09, 0.03, 1.65, 8);
      tentacleGeo.rotateX(Math.PI / 2);

      const ringGeo = new THREE.RingGeometry(1.55, 1.8, 28);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      });

      this.sharedGeometries.push(bellGeo, coreGeo, tentacleGeo, ringGeo);
      this.sharedMaterials.push(bellMat, coreMat, ringMat);

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = -0.5;
      group.add(new THREE.Mesh(bellGeo, bellMat), new THREE.Mesh(coreGeo, coreMat), ring);

      for (let t = 0; t < 5; t++) {
        const a = (t / 5) * Math.PI * 2;
        const tent = new THREE.Mesh(tentacleGeo, bellMat);
        tent.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 1.15);
        group.add(tent);
      }
    } else if (type === EnemyType.SCAVENGER) {
      // 3. SCAVENGER (NEON LIME-GOLD FEEDER): Bright lime-green carapace + 4 golden nutrient sacs + front feeler antennae + lime ring
      const somaGeo = new THREE.CapsuleGeometry(0.92, 1.15, 12, 18);
      somaGeo.rotateX(Math.PI / 2);
      const somaMat = new THREE.MeshStandardMaterial({
        color: 0x84cc16,
        emissive: 0x4d7c0f,
        emissiveIntensity: 0.72,
        roughness: 0.25,
      });

      const sacGeo = new THREE.SphereGeometry(0.38, 12, 10);
      const sacMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
      });

      const ringGeo = new THREE.RingGeometry(1.6, 1.85, 28);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xa3e635,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      });

      this.sharedGeometries.push(somaGeo, sacGeo, ringGeo);
      this.sharedMaterials.push(somaMat, sacMat, ringMat);

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = -0.5;
      group.add(new THREE.Mesh(somaGeo, somaMat), ring);

      for (let v = 0; v < 4; v++) {
        const a = (v / 4) * Math.PI * 2;
        const sac = new THREE.Mesh(sacGeo, sacMat);
        sac.position.set(Math.cos(a) * 0.75, 0.35, Math.sin(a) * 0.75);
        group.add(sac);
      }
    } else {
      // 4. DEFENSIVE (BLAZING ORANGE SPINED FORTRESS): Heavy orange-gold core + 14 long glowing warning spikes + wide territory ring
      const shellGeo = new THREE.DodecahedronGeometry(1.35, 1);
      const shellMat = new THREE.MeshStandardMaterial({
        color: 0xff7b00,
        emissive: 0xea580c,
        emissiveIntensity: 0.8,
        roughness: 0.22,
        metalness: 0.3,
      });
      const spineGeo = new THREE.ConeGeometry(0.24, 1.35, 8);
      const spineMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
      });
      const auraGeo = new THREE.RingGeometry(2.35, 2.7, 32);
      auraGeo.rotateX(-Math.PI / 2);
      const auraMat = new THREE.MeshBasicMaterial({
        color: 0xf97316,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      });

      this.sharedGeometries.push(shellGeo, spineGeo, auraGeo);
      this.sharedMaterials.push(shellMat, spineMat, auraMat);

      group.add(new THREE.Mesh(shellGeo, shellMat), new THREE.Mesh(auraGeo, auraMat));
      const dirs = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0.7, 0.7, 0).normalize(),
        new THREE.Vector3(-0.7, 0.7, 0).normalize(),
        new THREE.Vector3(0.7, -0.7, 0).normalize(),
        new THREE.Vector3(-0.7, -0.7, 0).normalize(),
        new THREE.Vector3(0, 0.7, 0.7).normalize(),
        new THREE.Vector3(0, 0.7, -0.7).normalize(),
      ];
      for (const d of dirs) {
        const sp = new THREE.Mesh(spineGeo, spineMat);
        sp.position.copy(d).multiplyScalar(1.55);
        sp.quaternion.setFromUnitVectors(_upVec, d);
        group.add(sp);
      }
    }

    return group;
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    this.activeCap = GRAPHICS_PRESETS[quality].maxEnemies;
    for (let i = 0; i < this.enemies.length; i++) {
      if (i >= this.activeCap) {
        this.enemies[i].active = false;
        this.enemies[i].mesh.visible = false;
      }
    }
  }

  public resetEnemiesForNewGame(initialCount = 8): void {
    const initialSpawnCount = Math.min(initialCount, this.activeCap);
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (i < initialSpawnCount) {
        this.spawnEnemyAtSafePerimeter(e, new THREE.Vector3(0, 0, 0));
      } else {
        e.active = false;
        e.mesh.visible = false;
      }
    }
  }

  private spawnEnemyAtSafePerimeter(enemy: EnemyEntity, playerPos: THREE.Vector3): void {
    const angle = Math.random() * Math.PI * 2;
    const distFromPlayer = 26 + Math.random() * 52;
    const x = THREE.MathUtils.clamp(
      playerPos.x + Math.cos(angle) * distFromPlayer,
      -(ARENA_RADIUS - 12),
      ARENA_RADIUS - 12,
    );
    const z = THREE.MathUtils.clamp(
      playerPos.z + Math.sin(angle) * distFromPlayer,
      -(ARENA_RADIUS - 12),
      ARENA_RADIUS - 12,
    );
    const y = THREE.MathUtils.clamp(
      playerPos.y + (Math.random() - 0.5) * 18,
      -(ARENA_VERTICAL_LIMIT * 0.75),
      ARENA_VERTICAL_LIMIT * 0.75,
    );

    enemy.position.set(x, y, z);
    enemy.territoryOrigin.copy(enemy.position);
    enemy.velocity.set(0, 0, 0);
    enemy.active = true;
    enemy.mesh.visible = true;
    enemy.mesh.position.copy(enemy.position);
  }

  public updateEnemies(
    dt: number,
    playerPos: THREE.Vector3,
    difficultyMultiplier: number,
    nutrients: NutrientInstance[],
    obstacles: ObstacleCluster[],
    isPlayerShielded: boolean,
    initialBaseEnemies = 8,
    levelSpeedMultiplier = 1.0,
  ): void {
    this.elapsedTime += dt;

    // Gradually activate more enemies from the pool as difficulty scales
    const targetActiveCount = Math.min(
      this.activeCap,
      Math.floor(initialBaseEnemies + (difficultyMultiplier - 1.0) * 8),
    );
    let currentActive = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].active) currentActive++;
    }
    if (currentActive < targetActiveCount) {
      for (let i = 0; i < this.enemies.length; i++) {
        if (!this.enemies[i].active && i < this.activeCap) {
          this.spawnEnemyAtSafePerimeter(this.enemies[i], playerPos);
          break;
        }
      }
    }

    const speedScale =
      Math.min(1.45, 1.0 + (difficultyMultiplier - 1.0) * 0.16) * levelSpeedMultiplier;

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;

      const distToPlayer = e.position.distanceTo(playerPos);

      // On the 10x map, recycle enemies that fall far behind (> 115m) into the active perimeter
      if (distToPlayer > 115) {
        this.spawnEnemyAtSafePerimeter(e, playerPos);
        continue;
      }

      let desiredSpeed = e.baseSpeed * speedScale;

      if (e.type === EnemyType.HUNTER) {
        // 1. HUNTER AI: Tracks and pursues the player at a steady, dodgeable pace
        _dirVec.subVectors(playerPos, e.position);
        if (_dirVec.lengthSq() > 0.01) _dirVec.normalize();

        if (isPlayerShielded && distToPlayer < 7.0) {
          // Repelled by Membrane Shield
          _dirVec.negate();
          desiredSpeed *= 1.2;
        } else if (distToPlayer < 9.5) {
          e.windupTimer += dt;
          if (e.windupTimer > 0.65) {
            desiredSpeed *= 1.15;
          }
        } else {
          e.windupTimer = 0;
        }
        e.targetDirection.lerp(_dirVec, 1 - Math.exp(-3.8 * dt)).normalize();
      } else if (e.type === EnemyType.WANDERER) {
        // 2. WANDERER AI: Smooth organic wandering
        e.steerTimer -= dt;
        if (e.steerTimer <= 0) {
          e.steerTimer = 2.2 + Math.random() * 2.5;
          const randAngle = Math.random() * Math.PI * 2;
          e.targetDirection
            .set(
              Math.cos(randAngle),
              (Math.random() - 0.5) * 0.3,
              Math.sin(randAngle),
            )
            .normalize();
        }
      } else if (e.type === EnemyType.SCAVENGER) {
        // 3. SCAVENGER AI: Searches for nearby nutrients and consumes them
        let bestNut: NutrientInstance | null = null;
        let bestDistSq = 28 * 28;
        for (let nIdx = 0; nIdx < nutrients.length; nIdx += 2) {
          const nut = nutrients[nIdx];
          if (!nut.active) continue;
          const dSq = e.position.distanceToSquared(nut.position);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestNut = nut;
          }
        }

        if (bestNut) {
          _dirVec.subVectors(bestNut.position, e.position);
          if (_dirVec.length() < 1.5) {
            const angle = Math.random() * Math.PI * 2;
            const r = 10 + Math.random() * 75;
            bestNut.position.set(
              playerPos.x + Math.cos(angle) * r,
              (Math.random() - 0.5) * 24,
              playerPos.z + Math.sin(angle) * r,
            );
          } else {
            _dirVec.normalize();
            e.targetDirection.lerp(_dirVec, 1 - Math.exp(-4.5 * dt)).normalize();
          }
        } else {
          e.targetDirection.applyAxisAngle(_upVec, dt * 0.5);
        }
      } else {
        // 4. DEFENSIVE AI: Protects its territory; lunges if player enters 12m radius
        const distFromHome = e.position.distanceTo(e.territoryOrigin);
        if (distToPlayer < 12.0 && !isPlayerShielded) {
          _dirVec.subVectors(playerPos, e.position).normalize();
          desiredSpeed *= 1.15;
          e.targetDirection.lerp(_dirVec, 1 - Math.exp(-5 * dt)).normalize();
        } else if (distFromHome > 6.5) {
          _dirVec.subVectors(e.territoryOrigin, e.position).normalize();
          e.targetDirection.lerp(_dirVec, 1 - Math.exp(-3.5 * dt)).normalize();
        } else {
          const orbitAngle = this.elapsedTime * 0.75 + e.phase;
          e.targetDirection.set(Math.cos(orbitAngle), 0, Math.sin(orbitAngle)).normalize();
          desiredSpeed *= 0.6;
        }
      }

      // Obstacle avoidance steering
      for (let o = 0; o < obstacles.length; o++) {
        const obs = obstacles[o];
        _avoidVec.subVectors(e.position, obs.position);
        const d = _avoidVec.length();
        const minSep = obs.radius + e.collisionRadius + 1.2;
        if (d < minSep && d > 0.001) {
          _avoidVec.normalize();
          e.targetDirection.addScaledVector(_avoidVec, 2.5 * dt).normalize();
        }
      }

      // Arena wall containment
      const radialLen = Math.hypot(e.position.x, e.position.z);
      if (radialLen > ARENA_RADIUS - 6.0) {
        _avoidVec.set(-e.position.x, 0, -e.position.z).normalize();
        e.targetDirection.lerp(_avoidVec, 1 - Math.exp(-8 * dt)).normalize();
      }
      if (Math.abs(e.position.y) > ARENA_VERTICAL_LIMIT - 4.0) {
        e.targetDirection.y = -Math.sign(e.position.y) * 0.5;
        e.targetDirection.normalize();
      }

      // Apply velocity with exponential damping
      _dirVec.copy(e.targetDirection).multiplyScalar(desiredSpeed);
      e.velocity.lerp(_dirVec, 1 - Math.exp(-5 * dt));
      e.position.addScaledVector(e.velocity, dt);

      // Update mesh transform & organic animation
      e.mesh.position.copy(e.position);
      if (e.velocity.lengthSq() > 0.05) {
        _dirVec.copy(e.position).add(e.velocity);
        _lookMat.lookAt(e.position, _dirVec, _upVec);
        _targetQuat.setFromRotationMatrix(_lookMat);
        e.mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-8 * dt));
      }

      const pulse = 1.15 + Math.sin(this.elapsedTime * 4.2 + e.phase) * 0.08;
      e.mesh.scale.setScalar(pulse);
    }
  }

  public dispose(): void {
    this.sharedGeometries.forEach((g) => g.dispose());
    this.sharedMaterials.forEach((m) => m.dispose());
  }
}
