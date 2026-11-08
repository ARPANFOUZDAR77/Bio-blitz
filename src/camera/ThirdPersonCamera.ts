import * as THREE from 'three';
import { ARENA_RADIUS, ARENA_VERTICAL_LIMIT } from '../constants';
import { ObstacleCluster } from '../entities/BloodstreamArena';

const _desiredCamPos = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();
const _shakeOffset = new THREE.Vector3();
const _obsVec = new THREE.Vector3();

export class ThirdPersonCameraController {
  private camera: THREE.Camera;
  public currentPos = new THREE.Vector3(0, 9.5, 16.5);
  public currentLookAt = new THREE.Vector3(0, 0, 0);

  // Spherical orbit angles relative to world
  public yawAngle = 0; // Radians around Y
  public pitchAngle = 0.48; // Radians above horizon (stay slightly above and behind)
  public distance = 15.5;
  public minDistance = 6.5;
  public maxDistance = 30.0;

  public sensitivity = 1.0;
  private trauma = 0;
  private elapsedTime = 0;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  public addYawPitchDelta(deltaYaw: number, deltaPitch: number): void {
    this.yawAngle -= deltaYaw * this.sensitivity;
    this.pitchAngle = THREE.MathUtils.clamp(
      this.pitchAngle + deltaPitch * this.sensitivity,
      0.16,
      1.22,
    );
  }

  public addZoomDelta(deltaDistance: number): void {
    this.distance = THREE.MathUtils.clamp(
      this.distance + deltaDistance,
      this.minDistance,
      this.maxDistance,
    );
  }

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  public snapToTarget(targetPos: THREE.Vector3): void {
    this.computeDesiredCameraPose(targetPos, 1.0);
    this.currentPos.copy(_desiredCamPos);
    this.currentLookAt.copy(_desiredLookAt);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  private computeDesiredCameraPose(targetPos: THREE.Vector3, playerSize: number): void {
    const effectiveDist = this.distance * (0.85 + playerSize * 0.2);
    const horizDist = Math.cos(this.pitchAngle) * effectiveDist;
    const vertDist = Math.sin(this.pitchAngle) * effectiveDist;

    _desiredCamPos.set(
      targetPos.x + Math.sin(this.yawAngle) * horizDist,
      targetPos.y + vertDist + 2.1,
      targetPos.z + Math.cos(this.yawAngle) * horizDist,
    );

    // Look slightly ahead/above the organism soma for a wider forward view
    _desiredLookAt.set(
      targetPos.x - Math.sin(this.yawAngle) * 2.2,
      targetPos.y + 0.45,
      targetPos.z - Math.cos(this.yawAngle) * 2.2,
    );
  }

  public updateCamera(
    dt: number,
    targetPos: THREE.Vector3,
    playerSize: number,
    obstacles: ObstacleCluster[],
    isMenuOrbit = false,
  ): void {
    this.elapsedTime += dt;

    if (isMenuOrbit) {
      this.yawAngle += dt * 0.22;
      this.pitchAngle = 0.38 + Math.sin(this.elapsedTime * 0.4) * 0.08;
    }

    this.computeDesiredCameraPose(targetPos, playerSize);

    // 1. Prevent clipping outside the Bloodstream Arena vessel walls
    const radialDist = Math.hypot(_desiredCamPos.x, _desiredCamPos.z);
    const maxSafeRadius = ARENA_RADIUS - 1.4;
    if (radialDist > maxSafeRadius) {
      const scale = maxSafeRadius / radialDist;
      _desiredCamPos.x *= scale;
      _desiredCamPos.z *= scale;
    }
    _desiredCamPos.y = THREE.MathUtils.clamp(
      _desiredCamPos.y,
      -ARENA_VERTICAL_LIMIT + 1.2,
      ARENA_VERTICAL_LIMIT - 1.2,
    );

    // 2. Prevent clipping inside Fibrin Clot obstacles
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      _obsVec.subVectors(_desiredCamPos, obs.position);
      const d = _obsVec.length();
      const safeObsDist = obs.radius + 1.1;
      if (d < safeObsDist && d > 0.001) {
        _obsVec.normalize().multiplyScalar(safeObsDist);
        _desiredCamPos.copy(obs.position).add(_obsVec);
      }
    }

    // 3. Smooth exponential interpolation (prevents sudden camera jumps)
    const posAlpha = 1 - Math.exp(-9.5 * dt);
    const lookAlpha = 1 - Math.exp(-12.0 * dt);
    this.currentPos.lerp(_desiredCamPos, posAlpha);
    this.currentLookAt.lerp(_desiredLookAt, lookAlpha);

    // 4. Decaying trauma camera shake on cellular damage
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 2.4);
      const shakeMag = this.trauma * this.trauma * 0.55;
      _shakeOffset.set(
        Math.sin(this.elapsedTime * 47) * shakeMag,
        Math.cos(this.elapsedTime * 53) * shakeMag,
        Math.sin(this.elapsedTime * 39) * shakeMag,
      );
      this.camera.position.copy(this.currentPos).add(_shakeOffset);
    } else {
      this.camera.position.copy(this.currentPos);
    }

    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Converts 2D joystick input (joyX, joyY in [-1, 1]) into camera-relative 3D movement vector.
   */
  public getCameraRelativeMovement(joyX: number, joyY: number, outVec: THREE.Vector3): THREE.Vector3 {
    const forwardX = -Math.sin(this.yawAngle);
    const forwardZ = -Math.cos(this.yawAngle);
    const rightX = Math.cos(this.yawAngle);
    const rightZ = -Math.sin(this.yawAngle);

    // joyY < 0 is pushing joystick UP (forward)
    const forwardInput = -joyY;
    const rightInput = joyX;

    outVec.set(
      forwardX * forwardInput + rightX * rightInput,
      0,
      forwardZ * forwardInput + rightZ * rightInput,
    );
    if (outVec.lengthSq() > 1.0) {
      outVec.normalize();
    }
    return outVec;
  }
}
