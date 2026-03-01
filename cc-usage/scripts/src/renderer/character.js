/**
 * character.js - CC-Usage 3D character
 * Based on claude-dolphin's blocky terracotta character design
 */
import * as THREE from 'three';

// FPS target per animation state (ms per frame)
const FPS_MAP = {
  sleeping: 1000 / 10,
  idle:     1000 / 24,
  happy:    1000 / 30,
  worried:  1000 / 30,
  panic:    1000 / 60,
  greeting: 1000 / 60,
  eating:   1000 / 60,
};

export class UsageCharacter {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'idle';
    this.clock = new THREE.Clock();
    this.group = null;
    this.orbitGroup = null;
    this.bodyMesh = null;
    this.legs = [];
    this.leftArm = null;
    this.rightArm = null;
    this.leftEye = null;
    this.rightEye = null;
    this.greetingPhase = 0;
    this.orbitY = 0;
    this.orbitX = 0;

    this.usagePercent = 0;

    // Body size scaling
    this.targetScale = 1.0;
    this.currentScale = 1.0;

    // Eating animation
    this.prevUsage = -1;
    this.eatingTimer = 0;
    this.mouth = null;

    // FPS throttle
    this._lastRenderTime = 0;

    this._initScene();
    this._build();
    this._animate();

    // Start with greeting
    this.setState('greeting');
    setTimeout(() => {
      if (this.state === 'greeting') this.setState('idle');
    }, 2200);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(1.8, 1.5, 4.0);
    this.camera.lookAt(0, 0.2, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, alpha: true, antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setSize(200, 200);
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Warm studio lighting
    this.scene.add(new THREE.AmbientLight(0xfff5ee, 0.6));

    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(3, 4, 5);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffe8d0, 0.35);
    fill.position.set(-3, 2, 2);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd4a0, 0.25);
    rim.position.set(0, 0, -4);
    this.scene.add(rim);
  }

  _roundedBox(width, height, depth, radius, segments = 4) {
    const hw = width / 2 - radius;
    const hh = height / 2 - radius;

    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hh - radius);
    shape.lineTo(hw, -hh - radius);
    shape.quadraticCurveTo(hw + radius, -hh - radius, hw + radius, -hh);
    shape.lineTo(hw + radius, hh);
    shape.quadraticCurveTo(hw + radius, hh + radius, hw, hh + radius);
    shape.lineTo(-hw, hh + radius);
    shape.quadraticCurveTo(-hw - radius, hh + radius, -hw - radius, hh);
    shape.lineTo(-hw - radius, -hh);
    shape.quadraticCurveTo(-hw - radius, -hh - radius, -hw, -hh - radius);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: depth - radius * 2,
      bevelEnabled: true,
      bevelThickness: radius,
      bevelSize: radius,
      bevelSegments: segments,
    });
    geo.translate(0, 0, -(depth - radius * 2) / 2);
    return geo;
  }

  // ================================================================
  // BUILD CHARACTER (same as claude-dolphin)
  // ================================================================
  _build() {
    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xd08050,
      roughness: 0.72,
      metalness: 0.0,
    });

    const legMat = new THREE.MeshStandardMaterial({
      color: 0xc87548,
      roughness: 0.75,
      metalness: 0.0,
    });

    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.5,
      metalness: 0.0,
    });

    // Body
    const bodyGeo = this._roundedBox(1.6, 1.0, 0.65, 0.08, 4);
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = 0.85;
    this.group.add(this.bodyMesh);

    // Eyes
    const eyeGeo = new THREE.BoxGeometry(0.12, 0.19, 0.10);

    this.leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    this.leftEye.position.set(-0.30, 0.90, 0.30);
    this.group.add(this.leftEye);

    this.rightEye = new THREE.Mesh(eyeGeo.clone(), eyeMat);
    this.rightEye.position.set(0.20, 0.90, 0.30);
    this.group.add(this.rightEye);

    // Mouth (hidden by default, shown during eating)
    const mouthGeo = new THREE.BoxGeometry(0.18, 0.08, 0.10);
    this.mouth = new THREE.Mesh(mouthGeo, eyeMat);
    this.mouth.position.set(-0.05, 0.72, 0.30);
    this.mouth.visible = false;
    this.group.add(this.mouth);

    // Arms
    const armGeo = this._roundedBox(0.35, 0.38, 0.20, 0.04, 3);

    this.leftArm = new THREE.Mesh(armGeo, legMat);
    this.leftArm.position.set(-0.88, 0.72, 0);
    this.group.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo.clone(), legMat);
    this.rightArm.position.set(0.88, 0.72, 0);
    this.group.add(this.rightArm);

    // Legs
    const legGeo = this._roundedBox(0.22, 0.36, 0.22, 0.04, 3);
    const legPositions = [
      { x: -0.48, z:  0.12 },
      { x:  0.48, z:  0.12 },
      { x: -0.48, z: -0.12 },
      { x:  0.48, z: -0.12 },
    ];

    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo.clone(), legMat);
      leg.position.set(pos.x, 0.18, pos.z);
      this.legs.push(leg);
      this.group.add(leg);
    }

    this.group.rotation.y = -0.25;

    this.orbitGroup = new THREE.Group();
    this.orbitGroup.add(this.group);
    this.scene.add(this.orbitGroup);
  }

  // ================================================================
  // UPDATE USAGE
  // ================================================================
  setUsage(percent) {
    this.usagePercent = Math.max(0, Math.min(100, percent));

    // Body size scaling: 0%→0.75, 50%→1.0, 100%→1.25
    this.targetScale = 0.75 + (this.usagePercent / 100) * 0.5;

    // Eating animation trigger: usage increased
    if (this.prevUsage >= 0 && this.usagePercent > this.prevUsage) {
      this.eatingTimer = 1.5;
      this.setState('eating');
    }
    this.prevUsage = this.usagePercent;

    // Update character state (skip if greeting, eating, or sleeping)
    if (this.state !== 'greeting' && this.state !== 'eating' && this.state !== 'sleeping') {
      if (this.usagePercent < 50) {
        this.setState('happy');
      } else if (this.usagePercent < 80) {
        this.setState('worried');
      } else {
        this.setState('panic');
      }
    }
  }

  // ================================================================
  // ANIMATION STATES
  // ================================================================
  setState(newState) {
    if (this.state === 'sleeping' && newState !== 'sleeping') {
      if (this.leftEye) this.leftEye.scale.set(1, 1, 1);
      if (this.rightEye) this.rightEye.scale.set(1, 1, 1);
    }
    this.state = newState;
    if (newState === 'greeting') this.greetingPhase = 0;
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    // FPS throttle: skip render if interval not elapsed
    const now = performance.now();
    const interval = FPS_MAP[this.state] || FPS_MAP.idle;
    if (now - this._lastRenderTime < interval) return;
    this._lastRenderTime = now;

    const t = this.clock.getElapsedTime();
    if (!this.group) return;

    const dt = t - (this._lastTime || 0);
    this._lastTime = t;
    this._handleBlink(t);

    // Smooth scale lerp
    this.currentScale += (this.targetScale - this.currentScale) * 0.05;
    this.group.scale.set(this.currentScale, this.currentScale, this.currentScale);

    // Eating timer countdown
    if (this.state === 'eating') {
      this.eatingTimer -= dt;
      if (this.eatingTimer <= 0) {
        this.eatingTimer = 0;
        if (this.mouth) this.mouth.visible = false;
        // Return to appropriate state
        if (this.usagePercent < 50) {
          this.setState('happy');
        } else if (this.usagePercent < 80) {
          this.setState('worried');
        } else {
          this.setState('panic');
        }
      }
    }

    switch (this.state) {
      case 'idle':     this._idle(t); break;
      case 'happy':    this._happy(t); break;
      case 'worried':  this._worried(t); break;
      case 'panic':    this._panic(t); break;
      case 'greeting': this._greeting(t); break;
      case 'sleeping': this._sleeping(t); break;
      case 'eating':   this._eating(t); break;
    }

    this._applyOrbit();
    this.renderer.render(this.scene, this.camera);
  }

  _handleBlink(t) {
    if (this.state === 'sleeping') return;
    const blinkCycle = t % 4.0;
    if (blinkCycle > 3.8 && blinkCycle < 3.95) {
      if (this.leftEye) this.leftEye.scale.y = 0.1;
      if (this.rightEye) this.rightEye.scale.y = 0.1;
    } else if (this.state !== 'sleeping') {
      if (this.leftEye) this.leftEye.scale.y = 1;
      if (this.rightEye) this.rightEye.scale.y = 1;
    }
  }

  // --- Gentle idle sway ---
  _idle(t) {
    this.bodyMesh.position.y = 0.85 + Math.sin(t * 1.5) * 0.02;
    this.bodyMesh.rotation.z = Math.sin(t * 0.8) * 0.02;
    this.group.rotation.y = -0.25 + Math.sin(t * 0.3) * 0.05;

    for (let i = 0; i < 4; i++) {
      this.legs[i].position.y = 0.18;
      this.legs[i].rotation.x = 0;
      this.legs[i].scale.y = 1;
    }
    this.legs[0].position.x = -0.48;
    this.legs[1].position.x = 0.48;
    this.legs[2].position.x = -0.48;
    this.legs[3].position.x = 0.48;

    if (this.leftArm) {
      this.leftArm.rotation.z = Math.sin(t * 1.2) * 0.05;
      this.leftArm.rotation.x = 0;
      this.leftArm.position.y = 0.72;
    }
    if (this.rightArm) {
      this.rightArm.rotation.z = -Math.sin(t * 1.2) * 0.05;
      this.rightArm.rotation.x = 0;
      this.rightArm.position.y = 0.72;
    }
  }

  // --- Happy bounce (usage < 50%) ---
  _happy(t) {
    const bounce = Math.abs(Math.sin(t * 3));
    this.bodyMesh.position.y = 0.85 + bounce * 0.04;
    this.bodyMesh.rotation.z = Math.sin(t * 2) * 0.03;
    this.bodyMesh.rotation.x = Math.sin(t * 3) * 0.01;
    this.group.rotation.y = -0.25 + Math.sin(t * 0.8) * 0.08;

    for (let i = 0; i < 4; i++) {
      this.legs[i].position.y = 0.18 + bounce * 0.02;
      this.legs[i].rotation.x = 0;
    }
    this.legs[0].position.x = -0.48;
    this.legs[1].position.x = 0.48;
    this.legs[2].position.x = -0.48;
    this.legs[3].position.x = 0.48;

    if (this.leftArm) {
      this.leftArm.rotation.z = Math.sin(t * 3) * 0.15;
      this.leftArm.rotation.x = 0;
      this.leftArm.position.y = 0.72 + bounce * 0.02;
    }
    if (this.rightArm) {
      this.rightArm.rotation.z = -Math.sin(t * 3 + 0.5) * 0.15;
      this.rightArm.rotation.x = 0;
      this.rightArm.position.y = 0.72 + bounce * 0.02;
    }

    if (Math.random() < 0.01) this._spawnSparkle();
  }

  // --- Worried fidget (usage 50-80%) ---
  _worried(t) {
    this.bodyMesh.position.y = 0.85 + Math.sin(t * 2.5) * 0.015;
    this.bodyMesh.rotation.z = Math.sin(t * 4) * 0.04;
    this.group.rotation.y = -0.25 + Math.sin(t * 1.5) * 0.06;

    // Nervous foot tapping
    const tap = Math.sin(t * 8);
    this.legs[0].position.y = 0.18 + Math.max(0, tap) * 0.04;
    this.legs[1].position.y = 0.18;
    this.legs[2].position.y = 0.18;
    this.legs[3].position.y = 0.18 + Math.max(0, -tap) * 0.04;

    this.legs[0].position.x = -0.48;
    this.legs[1].position.x = 0.48;
    this.legs[2].position.x = -0.48;
    this.legs[3].position.x = 0.48;

    // Arms wringing
    if (this.leftArm) {
      this.leftArm.rotation.z = 0.2 + Math.sin(t * 5) * 0.1;
      this.leftArm.rotation.x = Math.sin(t * 3) * 0.15;
      this.leftArm.position.y = 0.75;
    }
    if (this.rightArm) {
      this.rightArm.rotation.z = -0.2 - Math.sin(t * 5) * 0.1;
      this.rightArm.rotation.x = -Math.sin(t * 3) * 0.15;
      this.rightArm.position.y = 0.75;
    }

    // Worried eyes (slightly squinted)
    if (this.leftEye && this.leftEye.scale.y !== 0.1) {
      this.leftEye.scale.y = 0.7 + Math.sin(t * 2) * 0.1;
    }
    if (this.rightEye && this.rightEye.scale.y !== 0.1) {
      this.rightEye.scale.y = 0.7 + Math.sin(t * 2) * 0.1;
    }
  }

  // --- Panic shake (usage > 80%) ---
  _panic(t) {
    // Shaking rapidly
    const shake = Math.sin(t * 15) * 0.03;
    this.bodyMesh.position.y = 0.85 + Math.abs(Math.sin(t * 6)) * 0.03;
    this.bodyMesh.position.x = shake;
    this.bodyMesh.rotation.z = Math.sin(t * 8) * 0.06;
    this.group.rotation.y = -0.25 + Math.sin(t * 2) * 0.1;

    // All legs tapping frantically
    for (let i = 0; i < 4; i++) {
      this.legs[i].position.y = 0.18 + Math.abs(Math.sin(t * 10 + i * 1.5)) * 0.05;
      this.legs[i].rotation.x = Math.sin(t * 10 + i * 1.5) * 0.2;
    }
    this.legs[0].position.x = -0.48;
    this.legs[1].position.x = 0.48;
    this.legs[2].position.x = -0.48;
    this.legs[3].position.x = 0.48;

    // Arms flailing
    if (this.leftArm) {
      this.leftArm.rotation.z = Math.sin(t * 8) * 0.4;
      this.leftArm.rotation.x = Math.sin(t * 6) * 0.3;
      this.leftArm.position.y = 0.72 + Math.abs(Math.sin(t * 8)) * 0.1;
    }
    if (this.rightArm) {
      this.rightArm.rotation.z = -Math.sin(t * 8 + Math.PI) * 0.4;
      this.rightArm.rotation.x = Math.sin(t * 6 + Math.PI) * 0.3;
      this.rightArm.position.y = 0.72 + Math.abs(Math.sin(t * 8 + Math.PI)) * 0.1;
    }

    // Wide panicked eyes
    if (this.leftEye && this.leftEye.scale.y !== 0.1) {
      this.leftEye.scale.y = 1.2 + Math.sin(t * 10) * 0.1;
    }
    if (this.rightEye && this.rightEye.scale.y !== 0.1) {
      this.rightEye.scale.y = 1.2 + Math.sin(t * 10) * 0.1;
    }

    if (Math.random() < 0.04) this._spawnSparkle();
  }

  // --- Greeting (jump + spin) ---
  _greeting(t) {
    this.greetingPhase += 0.025;
    const p = this.greetingPhase;

    if (p < Math.PI) {
      const jumpH = Math.sin(p) * 0.5;
      this.bodyMesh.position.y = 0.85 + jumpH;
      this.bodyMesh.position.x = 0;
      for (let i = 0; i < 4; i++) {
        this.legs[i].position.y = 0.19 + jumpH;
        this.legs[i].scale.y = 1.0 - Math.sin(p) * 0.3;
      }
      this.group.rotation.y = -0.25 + p * 0.8;
      this.bodyMesh.rotation.z = Math.sin(p * 2) * 0.1;
    } else {
      const settle = Math.min((p - Math.PI) * 2, 1);
      this.bodyMesh.position.y = 0.85 + (1 - settle) * 0.1;
      this.bodyMesh.position.x = 0;
      for (let i = 0; i < 4; i++) {
        this.legs[i].position.y = 0.19;
        this.legs[i].scale.y = 1;
      }
      this.bodyMesh.rotation.z *= 0.9;
      this.group.rotation.y = -0.25 + Math.sin(t * 0.3) * 0.05;
    }

    if (this.leftEye) this.leftEye.scale.y = 1.0 + Math.sin(p * 3) * 0.15;
    if (this.rightEye) this.rightEye.scale.y = 1.0 + Math.sin(p * 3) * 0.15;

    if (this.leftArm) {
      this.leftArm.rotation.z = Math.sin(p * 3) * 0.4;
      this.leftArm.rotation.x = 0;
      this.leftArm.position.y = 0.72 + (p < Math.PI ? Math.sin(p) * 0.15 : 0);
    }
    if (this.rightArm) {
      this.rightArm.rotation.z = -Math.sin(p * 3) * 0.4;
      this.rightArm.rotation.x = 0;
      this.rightArm.position.y = 0.72 + (p < Math.PI ? Math.sin(p) * 0.15 : 0);
    }
  }

  // --- Eating (usage increased) ---
  _eating(t) {
    const duration = 1.5;
    const elapsed = duration - this.eatingTimer;
    const progress = Math.min(elapsed / duration, 1);

    // Mouth open/close animation
    if (this.mouth) {
      this.mouth.visible = true;
      // Mouth opens and closes repeatedly (chewing)
      const chew = Math.abs(Math.sin(elapsed * 8));
      this.mouth.scale.y = 0.5 + chew * 1.5;
    }

    // Squash & stretch body (eat → squash down, then stretch up)
    const squashPhase = Math.sin(elapsed * 6);
    const squashX = 1 + squashPhase * 0.08;
    const squashY = 1 - squashPhase * 0.08;
    this.bodyMesh.scale.set(squashX, squashY, squashX);

    this.bodyMesh.position.y = 0.85 + Math.abs(Math.sin(elapsed * 4)) * 0.03;
    this.bodyMesh.position.x = 0;
    this.bodyMesh.rotation.z = Math.sin(elapsed * 5) * 0.04;
    this.group.rotation.y = -0.25 + Math.sin(t * 0.5) * 0.05;

    // Arms move toward mouth
    if (this.leftArm) {
      const armLift = Math.sin(elapsed * 6) * 0.15;
      this.leftArm.rotation.z = 0.3 + armLift;
      this.leftArm.rotation.x = -0.3 + Math.sin(elapsed * 6) * 0.1;
      this.leftArm.position.y = 0.78 + Math.abs(Math.sin(elapsed * 6)) * 0.05;
    }
    if (this.rightArm) {
      const armLift = Math.sin(elapsed * 6 + 0.5) * 0.15;
      this.rightArm.rotation.z = -0.3 - armLift;
      this.rightArm.rotation.x = -0.3 + Math.sin(elapsed * 6 + 0.5) * 0.1;
      this.rightArm.position.y = 0.78 + Math.abs(Math.sin(elapsed * 6 + 0.5)) * 0.05;
    }

    // Legs stay grounded
    for (let i = 0; i < 4; i++) {
      this.legs[i].position.y = 0.18;
      this.legs[i].rotation.x = 0;
    }
    this.legs[0].position.x = -0.48;
    this.legs[1].position.x = 0.48;
    this.legs[2].position.x = -0.48;
    this.legs[3].position.x = 0.48;

    // Happy eyes while eating
    if (this.leftEye && this.leftEye.scale.y !== 0.1) {
      this.leftEye.scale.y = 0.8 + Math.sin(elapsed * 4) * 0.1;
    }
    if (this.rightEye && this.rightEye.scale.y !== 0.1) {
      this.rightEye.scale.y = 0.8 + Math.sin(elapsed * 4) * 0.1;
    }
  }

  // --- Sleeping ---
  _sleeping(t) {
    this.bodyMesh.position.y = 0.85 + Math.sin(t * 0.5) * 0.01;
    this.bodyMesh.position.x = 0;
    this.bodyMesh.rotation.z = 0.08 + Math.sin(t * 0.4) * 0.01;
    this.group.rotation.y = -0.25;

    if (this.leftEye) this.leftEye.scale.y = 0.08;
    if (this.rightEye) this.rightEye.scale.y = 0.08;

    for (let i = 0; i < 4; i++) {
      this.legs[i].position.y = 0.19;
    }

    if (this.leftArm) {
      this.leftArm.rotation.z = 0.1 + Math.sin(t * 0.5) * 0.02;
      this.leftArm.rotation.x = 0;
      this.leftArm.position.y = 0.72;
    }
    if (this.rightArm) {
      this.rightArm.rotation.z = -0.1 - Math.sin(t * 0.5) * 0.02;
      this.rightArm.rotation.x = 0;
      this.rightArm.position.y = 0.72;
    }

    const breathe = 1 + Math.sin(t * 1.2) * 0.008;
    this.bodyMesh.scale.set(breathe, breathe, breathe);

    // Spawn Zzz particles (~1 per second at 60fps)
    if (Math.random() < 0.015) this._spawnZzz();
  }

  // ================================================================
  // ORBIT CONTROL
  // ================================================================
  addOrbit(dx, dy) {
    this.orbitY += dx * 0.01;
    this.orbitX += dy * 0.01;
    this.orbitX = Math.max(-0.5, Math.min(0.5, this.orbitX));
  }

  _applyOrbit() {
    if (!this.orbitGroup) return;
    this.orbitGroup.rotation.y = this.orbitY;
    this.orbitGroup.rotation.x = this.orbitX;
  }

  _spawnSparkle() {
    const c = document.getElementById('character-container');
    if (!c) return;
    const s = document.createElement('div');
    s.className = 'sparkle';
    s.textContent = '✦';
    s.style.left = (60 + Math.random() * 80) + 'px';
    s.style.top = (40 + Math.random() * 60) + 'px';
    s.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
    c.appendChild(s);
    setTimeout(() => s.remove(), 1500);
  }

  _spawnZzz() {
    const c = document.getElementById('character-container');
    if (!c) return;
    const z = document.createElement('div');
    z.className = 'zzz';
    z.textContent = Math.random() < 0.5 ? 'Z' : 'z';
    z.style.fontSize = (12 + Math.random() * 8) + 'px';
    z.style.left = (110 + Math.random() * 30) + 'px';
    z.style.top = (30 + Math.random() * 20) + 'px';
    c.appendChild(z);
    setTimeout(() => z.remove(), 2600);
  }
}
