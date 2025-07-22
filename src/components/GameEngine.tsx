import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';

// Game constants
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 600;
const GRAVITY = 0.8;
const JUMP_FORCE = -15;
const MOVE_SPEED = 5;
const DASH_SPEED = 12;
const COYOTE_TIME = 8; // frames
const JUMP_BUFFER_TIME = 8; // frames

// Animation frame counts
const ANIMATION_SPEEDS = {
  idle: 60,
  running: 8,
  jumping: 1,
  damage: 30
};

// Game types
interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  onGround: boolean;
  facing: 'left' | 'right';
  state: 'idle' | 'running' | 'jumping' | 'dashing' | 'damage';
  canDoubleJump: boolean;
  hasDoubleJumped: boolean;
  dashCooldown: number;
  health: number;
  coyoteTime: number;
  jumpBuffer: number;
  animationFrame: number;
  animationTimer: number;
  invulnerable: number;
}

interface Token {
  x: number;
  y: number;
  width: number;
  height: number;
  collected: boolean;
  type: 'shopify' | 'gem';
  value: number;
  animationFrame: number;
}

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'normal' | 'crumbling' | 'moving';
  moveSpeed?: number;
  moveDirection?: number;
  originalX?: number;
  moveRange?: number;
}

interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  type: 'magentoBot' | 'salesforceKraken' | 'wooZombie';
  health: number;
  active: boolean;
  animationFrame: number;
  animationTimer: number;
  state: 'idle' | 'walk' | 'attack' | 'damage';
  attackCooldown: number;
  floatOffset?: number;
}

interface PowerUp {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'themeBooster' | 'checkoutDash' | 'appMagnet';
  collected: boolean;
  duration: number;
  animationFrame: number;
}

interface Particle {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'spark' | 'dust' | 'code' | 'explosion';
}

interface GameState {
  level: number;
  score: number;
  tokens: number;
  time: number;
  paused: boolean;
  gameOver: boolean;
  victory: boolean;
  currentLevel: 'magento' | 'salesforce' | 'woocommerce' | 'boss';
  screenShake: number;
  cameraX: number;
  musicEnabled: boolean;
  sfxEnabled: boolean;
}

interface BackgroundLayer {
  x: number;
  speed: number;
  elements: Array<{
    x: number;
    y: number;
    type: 'terminal' | 'code' | 'wire' | 'cloud';
    animationFrame: number;
  }>;
}

const GameEngine: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const keysRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const backgroundMusicRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Game state
  const [gameState, setGameState] = useState<GameState>({
    level: 1,
    score: 0,
    tokens: 0,
    time: 0,
    paused: false,
    gameOver: false,
    victory: false,
    currentLevel: 'magento',
    screenShake: 0,
    cameraX: 0,
    musicEnabled: true,
    sfxEnabled: true
  });

  // Game objects
  const [player, setPlayer] = useState<Player>({
    x: 100,
    y: 400,
    width: 32,
    height: 48,
    velocityX: 0,
    velocityY: 0,
    onGround: false,
    facing: 'right',
    state: 'idle',
    canDoubleJump: true,
    hasDoubleJumped: false,
    dashCooldown: 0,
    health: 3,
    coyoteTime: 0,
    jumpBuffer: 0,
    animationFrame: 0,
    animationTimer: 0,
    invulnerable: 0
  });

  const [platforms] = useState<Platform[]>([
    // Ground platforms
    { x: 0, y: 550, width: 300, height: 50, type: 'normal' },
    { x: 400, y: 450, width: 200, height: 20, type: 'normal' },
    { x: 700, y: 350, width: 150, height: 20, type: 'crumbling' },
    { x: 950, y: 250, width: 200, height: 20, type: 'moving', moveSpeed: 1, moveDirection: 1, originalX: 950, moveRange: 100 },
    { x: 1150, y: 550, width: 50, height: 50, type: 'normal' }, // Goal platform
    // Additional platforms for better level design
    { x: 300, y: 350, width: 80, height: 20, type: 'normal' },
    { x: 600, y: 500, width: 120, height: 20, type: 'normal' },
    { x: 850, y: 400, width: 80, height: 20, type: 'crumbling' },
  ]);

  const [tokens, setTokens] = useState<Token[]>([
    { x: 450, y: 400, width: 20, height: 20, collected: false, type: 'shopify', value: 10, animationFrame: 0 },
    { x: 750, y: 300, width: 20, height: 20, collected: false, type: 'shopify', value: 10, animationFrame: 0 },
    { x: 1000, y: 200, width: 20, height: 20, collected: false, type: 'gem', value: 50, animationFrame: 0 },
    { x: 200, y: 500, width: 20, height: 20, collected: false, type: 'shopify', value: 10, animationFrame: 0 },
    { x: 320, y: 300, width: 20, height: 20, collected: false, type: 'shopify', value: 10, animationFrame: 0 },
    { x: 620, y: 450, width: 20, height: 20, collected: false, type: 'gem', value: 50, animationFrame: 0 },
  ]);

  const [enemies, setEnemies] = useState<Enemy[]>([
    { 
      x: 500, y: 400, width: 32, height: 32, velocityX: -1, velocityY: 0, 
      type: 'magentoBot', health: 2, active: true, animationFrame: 0, animationTimer: 0,
      state: 'walk', attackCooldown: 0
    },
    { 
      x: 800, y: 300, width: 40, height: 24, velocityX: 0, velocityY: 0, 
      type: 'salesforceKraken', health: 3, active: true, animationFrame: 0, animationTimer: 0,
      state: 'idle', attackCooldown: 0, floatOffset: 0
    },
    { 
      x: 650, y: 450, width: 28, height: 36, velocityX: 0.5, velocityY: 0, 
      type: 'wooZombie', health: 2, active: true, animationFrame: 0, animationTimer: 0,
      state: 'walk', attackCooldown: 0
    },
  ]);

  const [powerUps, setPowerUps] = useState<PowerUp[]>([
    { x: 600, y: 400, width: 24, height: 24, type: 'themeBooster', collected: false, duration: 0, animationFrame: 0 },
    { x: 350, y: 300, width: 24, height: 24, type: 'checkoutDash', collected: false, duration: 0, animationFrame: 0 },
  ]);

  const [particles, setParticles] = useState<Particle[]>([]);

  const [backgroundLayers] = useState<BackgroundLayer[]>([
    // Far background
    {
      x: 0,
      speed: 0.2,
      elements: [
        { x: 100, y: 100, type: 'terminal', animationFrame: 0 },
        { x: 300, y: 150, type: 'terminal', animationFrame: 0 },
        { x: 500, y: 80, type: 'cloud', animationFrame: 0 },
        { x: 800, y: 120, type: 'terminal', animationFrame: 0 },
        { x: 1000, y: 90, type: 'cloud', animationFrame: 0 },
      ]
    },
    // Mid background
    {
      x: 0,
      speed: 0.5,
      elements: [
        { x: 150, y: 200, type: 'code', animationFrame: 0 },
        { x: 400, y: 250, type: 'wire', animationFrame: 0 },
        { x: 650, y: 180, type: 'code', animationFrame: 0 },
        { x: 900, y: 220, type: 'wire', animationFrame: 0 },
      ]
    },
    // Near background
    {
      x: 0,
      speed: 0.8,
      elements: [
        { x: 200, y: 300, type: 'wire', animationFrame: 0 },
        { x: 600, y: 350, type: 'code', animationFrame: 0 },
        { x: 1000, y: 320, type: 'wire', animationFrame: 0 },
      ]
    }
  ]);

  // Audio functions
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

  const playSound = useCallback((frequency: number, duration: number, type: 'sine' | 'square' | 'sawtooth' = 'square') => {
    if (!gameState.sfxEnabled || !audioContextRef.current) return;
    
    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContextRef.current.currentTime);
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + duration);
    
    oscillator.start(audioContextRef.current.currentTime);
    oscillator.stop(audioContextRef.current.currentTime + duration);
  }, [gameState.sfxEnabled]);

  const playJumpSound = useCallback(() => {
    playSound(440, 0.1, 'square');
  }, [playSound]);

  const playTokenSound = useCallback(() => {
    playSound(880, 0.2, 'sine');
    setTimeout(() => playSound(1320, 0.1, 'sine'), 50);
  }, [playSound]);

  const playEnemyDefeatSound = useCallback(() => {
    playSound(220, 0.3, 'sawtooth');
  }, [playSound]);

  const playDamageSound = useCallback(() => {
    playSound(150, 0.4, 'sawtooth');
  }, [playSound]);

  const playPowerUpSound = useCallback(() => {
    const notes = [440, 554, 659, 880];
    notes.forEach((note, i) => {
      setTimeout(() => playSound(note, 0.1, 'sine'), i * 50);
    });
  }, [playSound]);

  const startBackgroundMusic = useCallback(() => {
    if (!gameState.musicEnabled || !audioContextRef.current || backgroundMusicRef.current) return;
    
    // Create a simple chiptune melody
    const playMelodyNote = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContextRef.current!.createOscillator();
      const gainNode = audioContextRef.current!.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current!.destination);
      
      oscillator.frequency.setValueAtTime(frequency, startTime);
      oscillator.type = 'square';
      
      gainNode.gain.setValueAtTime(0.05, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    
    // Simple melody pattern
    const melody = [440, 523, 659, 523, 440, 392, 440, 523];
    const currentTime = audioContextRef.current.currentTime;
    
    melody.forEach((note, i) => {
      playMelodyNote(note, currentTime + i * 0.5, 0.4);
    });
    
    // Loop the music
    setTimeout(() => {
      if (gameState.musicEnabled) {
        startBackgroundMusic();
      }
    }, melody.length * 500);
  }, [gameState.musicEnabled]);

  // Particle system
  const addParticles = useCallback((x: number, y: number, count: number, type: Particle['type'], color: string) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        x: x + Math.random() * 20 - 10,
        y: y + Math.random() * 20 - 10,
        velocityX: (Math.random() - 0.5) * 8,
        velocityY: (Math.random() - 0.5) * 8 - 2,
        life: 60,
        maxLife: 60,
        color,
        size: Math.random() * 4 + 2,
        type
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  }, []);

  const updateParticles = useCallback(() => {
    setParticles(prev => prev.map(particle => ({
      ...particle,
      x: particle.x + particle.velocityX,
      y: particle.y + particle.velocityY,
      velocityY: particle.velocityY + 0.2, // gravity
      life: particle.life - 1
    })).filter(particle => particle.life > 0));
  }, []);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      
      // Jump buffer
      if ((e.key.toLowerCase() === 'w' || e.key === 'ArrowUp' || e.key === ' ')) {
        setPlayer(prev => ({ ...prev, jumpBuffer: JUMP_BUFFER_TIME }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Initialize audio on first user interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      initAudio();
      startBackgroundMusic();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [initAudio, startBackgroundMusic]);

  // Collision detection
  const checkCollision = (rect1: any, rect2: any) => {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
  };

  // Update player physics and movement
  const updatePlayer = useCallback(() => {
    if (gameState.paused || gameState.gameOver) return;

    setPlayer(prev => {
      const newPlayer = { ...prev };
      const keys = keysRef.current;

      // Update animation
      newPlayer.animationTimer++;
      if (newPlayer.animationTimer >= ANIMATION_SPEEDS[newPlayer.state]) {
        newPlayer.animationFrame = (newPlayer.animationFrame + 1) % 4;
        newPlayer.animationTimer = 0;
      }

      // Handle input with acceleration
      const acceleration = 0.8;
      const friction = 0.85;
      const maxSpeed = MOVE_SPEED;

      if (keys.has('a') || keys.has('arrowleft')) {
        newPlayer.velocityX = Math.max(newPlayer.velocityX - acceleration, -maxSpeed);
        newPlayer.facing = 'left';
        if (newPlayer.onGround) newPlayer.state = 'running';
      } else if (keys.has('d') || keys.has('arrowright')) {
        newPlayer.velocityX = Math.min(newPlayer.velocityX + acceleration, maxSpeed);
        newPlayer.facing = 'right';
        if (newPlayer.onGround) newPlayer.state = 'running';
      } else {
        newPlayer.velocityX *= friction;
        if (newPlayer.onGround && Math.abs(newPlayer.velocityX) < 0.1) {
          newPlayer.state = 'idle';
          newPlayer.velocityX = 0;
        }
      }

      // Variable jump height
      const jumpPressed = keys.has('w') || keys.has('arrowup') || keys.has(' ');
      
      // Coyote time
      if (newPlayer.onGround) {
        newPlayer.coyoteTime = COYOTE_TIME;
        newPlayer.hasDoubleJumped = false;
      } else if (newPlayer.coyoteTime > 0) {
        newPlayer.coyoteTime--;
      }

      // Jump buffer
      if (newPlayer.jumpBuffer > 0) {
        newPlayer.jumpBuffer--;
      }

      // Jumping with coyote time and jump buffer
      if (newPlayer.jumpBuffer > 0 && 
          (newPlayer.coyoteTime > 0 || (!newPlayer.hasDoubleJumped && newPlayer.canDoubleJump))) {
        if (newPlayer.coyoteTime <= 0 && newPlayer.canDoubleJump) {
          newPlayer.hasDoubleJumped = true;
        }
        newPlayer.velocityY = JUMP_FORCE;
        newPlayer.onGround = false;
        newPlayer.coyoteTime = 0;
        newPlayer.jumpBuffer = 0;
        newPlayer.state = 'jumping';
        playJumpSound();
      }

      // Variable jump height - cut jump short if key released
      if (!jumpPressed && newPlayer.velocityY < -5) {
        newPlayer.velocityY *= 0.5;
      }

      // Dashing
      if (keys.has('shift') && newPlayer.dashCooldown <= 0) {
        newPlayer.velocityX = newPlayer.facing === 'right' ? DASH_SPEED : -DASH_SPEED;
        newPlayer.state = 'dashing';
        newPlayer.dashCooldown = 60;
        // Only add particles during dash, not constantly
        addParticles(newPlayer.x + newPlayer.width/2, newPlayer.y + newPlayer.height/2, 3, 'spark', '#7C3AED');
      }

      // Apply gravity
      if (!newPlayer.onGround) {
        newPlayer.velocityY += GRAVITY;
        if (newPlayer.state !== 'dashing') {
          newPlayer.state = 'jumping';
        }
      }

      // Update position
      newPlayer.x += newPlayer.velocityX;
      newPlayer.y += newPlayer.velocityY;

      // Platform collision with improved detection
      const wasOnGround = newPlayer.onGround;
      newPlayer.onGround = false;
      
      platforms.forEach(platform => {
        // Update moving platforms
        if (platform.type === 'moving' && platform.moveSpeed && platform.originalX !== undefined && platform.moveRange) {
          platform.x += platform.moveSpeed * (platform.moveDirection || 1);
          if (platform.x >= platform.originalX + platform.moveRange || platform.x <= platform.originalX) {
            platform.moveDirection = -(platform.moveDirection || 1);
          }
        }

        if (checkCollision(newPlayer, platform)) {
          // Landing on top of platform
          if (newPlayer.velocityY > 0 && newPlayer.y < platform.y) {
            newPlayer.y = platform.y - newPlayer.height;
            newPlayer.velocityY = 0;
            newPlayer.onGround = true;
            
            // Landing particles
            if (!wasOnGround) {
              addParticles(newPlayer.x + newPlayer.width/2, newPlayer.y + newPlayer.height, 5, 'dust', '#8B4513');
            }
          }
          // Hitting platform from below
          else if (newPlayer.velocityY < 0 && newPlayer.y > platform.y) {
            newPlayer.y = platform.y + platform.height;
            newPlayer.velocityY = 0;
          }
          // Side collision
          else if (newPlayer.velocityX > 0) {
            newPlayer.x = platform.x - newPlayer.width;
            newPlayer.velocityX = 0;
          } else if (newPlayer.velocityX < 0) {
            newPlayer.x = platform.x + platform.width;
            newPlayer.velocityX = 0;
          }
        }
      });

      // Boundary checks
      if (newPlayer.x < 0) newPlayer.x = 0;
      if (newPlayer.x + newPlayer.width > CANVAS_WIDTH) newPlayer.x = CANVAS_WIDTH - newPlayer.width;
      if (newPlayer.y > CANVAS_HEIGHT) {
        // Player fell off the world
        newPlayer.health -= 1;
        newPlayer.x = 100;
        newPlayer.y = 400;
        newPlayer.velocityX = 0;
        newPlayer.velocityY = 0;
        newPlayer.state = 'damage';
        newPlayer.invulnerable = 120;
        playDamageSound();
        setGameState(gs => ({ ...gs, screenShake: 20 }));
      }

      // Update cooldowns and timers
      if (newPlayer.dashCooldown > 0) newPlayer.dashCooldown--;
      if (newPlayer.invulnerable > 0) newPlayer.invulnerable--;

      return newPlayer;
    });
  }, [gameState.paused, gameState.gameOver, platforms, playJumpSound, playDamageSound, addParticles]);

  // Update tokens and collectibles
  const updateTokens = useCallback(() => {
    setTokens(prev => prev.map(token => {
      // Update token animation
      token.animationFrame = (token.animationFrame + 1) % 60;
      
      if (!token.collected && checkCollision(player, token)) {
        setGameState(gs => ({
          ...gs,
          tokens: gs.tokens + 1,
          score: gs.score + token.value
        }));
        playTokenSound();
        addParticles(token.x + token.width/2, token.y + token.height/2, 6, 'spark', token.type === 'shopify' ? '#00D4AA' : '#FFD700');
        return { ...token, collected: true };
      }
      return token;
    }));
  }, [player, playTokenSound, addParticles]);

  // Update enemies with improved AI
  const updateEnemies = useCallback(() => {
    setEnemies(prev => prev.map(enemy => {
      if (!enemy.active) return enemy;

      const newEnemy = { ...enemy };
      
      // Update animation
      newEnemy.animationTimer++;
      if (newEnemy.animationTimer >= 15) {
        newEnemy.animationFrame = (newEnemy.animationFrame + 1) % 4;
        newEnemy.animationTimer = 0;
      }

      // AI behavior based on enemy type
      if (enemy.type === 'magentoBot') {
        // Sluggish movement with glitches
        newEnemy.x += newEnemy.velocityX;
        if (Math.random() < 0.02) { // Random glitch
          newEnemy.velocityX = 0;
          newEnemy.state = 'damage';
          setTimeout(() => {
            if (newEnemy.active) newEnemy.state = 'walk';
          }, 500);
        }
        // Bounce off edges
        if (newEnemy.x <= 0 || newEnemy.x >= CANVAS_WIDTH - newEnemy.width) {
          newEnemy.velocityX *= -1;
        }
      } else if (enemy.type === 'salesforceKraken') {
        // Floating jellyfish-like movement
        newEnemy.floatOffset = (newEnemy.floatOffset || 0) + 0.1;
        newEnemy.y += Math.sin(newEnemy.floatOffset) * 0.5;
        newEnemy.state = 'idle';
      } else if (enemy.type === 'wooZombie') {
        // Slow lurching movement
        newEnemy.x += newEnemy.velocityX;
        if (Math.random() < 0.01) { // Random direction change
          newEnemy.velocityX = (Math.random() - 0.5) * 1;
        }
        // Boundary check
        if (newEnemy.x <= 0 || newEnemy.x >= CANVAS_WIDTH - newEnemy.width) {
          newEnemy.velocityX *= -1;
        }
      }

      // Check collision with player
      if (checkCollision(player, newEnemy) && player.invulnerable <= 0) {
        if (player.state === 'dashing') {
          // Player defeats enemy while dashing
          newEnemy.active = false;
          setGameState(gs => ({ ...gs, score: gs.score + 100, screenShake: 15 }));
          playEnemyDefeatSound();
          addParticles(newEnemy.x + newEnemy.width/2, newEnemy.y + newEnemy.height/2, 12, 'explosion', '#FF4444');
        } else {
          // Player takes damage
          setPlayer(p => ({ 
            ...p, 
            health: p.health - 1, 
            state: 'damage',
            invulnerable: 120,
            velocityX: p.facing === 'right' ? -5 : 5
          }));
          playDamageSound();
          setGameState(gs => ({ ...gs, screenShake: 25 }));
        }
      }

      return newEnemy;
    }));
  }, [player, playEnemyDefeatSound, playDamageSound, addParticles]);

  // Update power-ups
  const updatePowerUps = useCallback(() => {
    setPowerUps(prev => prev.map(powerUp => {
      powerUp.animationFrame = (powerUp.animationFrame + 1) % 60;
      
      if (!powerUp.collected && checkCollision(player, powerUp)) {
        playPowerUpSound();
        addParticles(powerUp.x + powerUp.width/2, powerUp.y + powerUp.height/2, 10, 'spark', '#7C3AED');
        setGameState(gs => ({ ...gs, score: gs.score + 200 }));
        return { ...powerUp, collected: true };
      }
      return powerUp;
    }));
  }, [player, playPowerUpSound, addParticles]);

  // Update background elements
  const updateBackground = useCallback(() => {
    backgroundLayers.forEach(layer => {
      layer.x -= layer.speed;
      if (layer.x <= -CANVAS_WIDTH) {
        layer.x = 0;
      }
      
      layer.elements.forEach(element => {
        element.animationFrame = (element.animationFrame + 1) % 120;
      });
    });
  }, [backgroundLayers]);

  // Render function with pixel art styling
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply screen shake
    if (gameState.screenShake > 0) {
      ctx.save();
      ctx.translate(
        (Math.random() - 0.5) * gameState.screenShake,
        (Math.random() - 0.5) * gameState.screenShake
      );
      setGameState(gs => ({ ...gs, screenShake: Math.max(0, gs.screenShake - 1) }));
    }

    // Clear canvas with level-specific background
    const bgColors = {
      magento: '#FF6B35',
      salesforce: '#00A1E0',
      woocommerce: '#7F54B3',
      boss: '#2C3E50'
    };
    
    ctx.fillStyle = bgColors[gameState.currentLevel];
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw parallax background layers with legacy platform landscape
    backgroundLayers.forEach((layer, layerIndex) => {
      layer.elements.forEach(element => {
        const x = element.x + layer.x;
        const y = element.y;
        
        if (element.type === 'terminal') {
          // Cracked server towers with legacy labels
          const flicker = Math.sin(element.animationFrame * 0.3) > 0.5;
          
          // Server tower base
          ctx.fillStyle = layerIndex === 0 ? '#4A4A4A' : '#666';
          ctx.fillRect(x, y, 40, 60);
          
          // Cracks in the server
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 10, y);
          ctx.lineTo(x + 8, y + 60);
          ctx.moveTo(x + 25, y + 10);
          ctx.lineTo(x + 30, y + 50);
          ctx.stroke();
          
          // Flickering screen
          ctx.fillStyle = flicker ? '#FF4444' : '#440000';
          ctx.fillRect(x + 5, y + 10, 30, 20);
          
          // Legacy labels
          ctx.fillStyle = '#CCCCCC';
          ctx.font = '8px monospace';
          if (layerIndex === 0) {
            ctx.fillText('Magento 1.9', x + 2, y + 45);
          } else {
            ctx.fillText('API v20', x + 8, y + 45);
          }
          
          // Error signs
          if (flicker) {
            ctx.fillStyle = '#FF0000';
            ctx.font = 'bold 10px monospace';
            ctx.fillText('404', x + 15, y + 22);
          }
          
        } else if (element.type === 'code') {
          // Matrix-style code rain with legacy elements
          const codeY = (y + element.animationFrame * 1.5) % CANVAS_HEIGHT;
          ctx.fillStyle = layerIndex === 0 ? '#004400' : '#006600';
          ctx.font = '10px monospace';
          
          // Falling code snippets
          const codeSnippets = ['<?php', 'SELECT *', 'UPDATE', 'NULL', 'ERROR', 'DEPRECATED'];
          const snippet = codeSnippets[Math.floor(element.animationFrame / 20) % codeSnippets.length];
          ctx.fillText(snippet, x, codeY);
          ctx.fillText('01010101', x, codeY + 12);
          
          // Broken plugin icons falling
          if (element.animationFrame % 40 < 20) {
            ctx.fillStyle = '#FF6B35';
            ctx.fillRect(x + 20, codeY - 5, 8, 8);
            ctx.fillStyle = '#FFF';
            ctx.font = '6px monospace';
            ctx.fillText('!', x + 22, codeY);
          }
          
        } else if (element.type === 'wire') {
          // Tangled CRM wires and cables
          const twitch = Math.sin(element.animationFrame * 0.5) * 3;
          const pulse = Math.sin(element.animationFrame * 0.2) * 0.5 + 0.5;
          
          // Main wire
          ctx.strokeStyle = `rgba(102, 102, 102, ${0.7 + pulse * 0.3})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 20 + twitch, y + 15, x + 40, y + 30);
          ctx.quadraticCurveTo(x + 60 - twitch, y + 45, x + 80, y + 20);
          ctx.stroke();
          
          // Connector nodes
          ctx.fillStyle = pulse > 0.7 ? '#00A1E0' : '#004080';
          ctx.beginPath();
          ctx.arc(x + 20, y + 15, 3, 0, Math.PI * 2);
          ctx.arc(x + 60, y + 45, 3, 0, Math.PI * 2);
          ctx.fill();
          
        } else if (element.type === 'cloud') {
          // Glitchy UI clouds and error pop-ups
          const cloudX = (x + element.animationFrame * 0.3) % (CANVAS_WIDTH + 80);
          const glitch = element.animationFrame % 60 < 5;
          
          if (glitch) {
            // Glitched appearance
            ctx.fillStyle = 'rgba(255, 100, 100, 0.4)';
            ctx.fillRect(cloudX - 2, y - 2, 64, 24);
          }
          
          // Main cloud shape (UI modal)
          ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
          ctx.fillRect(cloudX, y, 60, 20);
          
          // Modal content
          ctx.fillStyle = '#333';
          ctx.font = '8px monospace';
          ctx.fillText('Processing...', cloudX + 5, y + 12);
          
          // Loading spinner
          const spinAngle = (element.animationFrame * 0.3) % (Math.PI * 2);
          ctx.strokeStyle = '#666';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cloudX + 50, y + 10, 4, spinAngle, spinAngle + Math.PI);
          ctx.stroke();
        }
      });
    });
    
    // Add Shopify portal glow in the distance
    if (player.x > 800) {
      const portalGlow = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
      const gradient = ctx.createRadialGradient(1175, 525, 0, 1175, 525, 100);
      gradient.addColorStop(0, `rgba(0, 212, 170, ${portalGlow * 0.3})`);
      gradient.addColorStop(1, 'rgba(0, 212, 170, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(1075, 425, 200, 200);
      
      // Clean UI elements sliding in
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      const slideOffset = Math.sin(Date.now() * 0.003) * 10;
      ctx.fillRect(1100 + slideOffset, 450, 40, 8);
      ctx.fillRect(1110 - slideOffset, 470, 60, 8);
      ctx.fillRect(1105 + slideOffset * 0.5, 490, 50, 8);
    }

    // Draw platforms with pixel art styling
    platforms.forEach(platform => {
      if (platform.type === 'normal') {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
        // Add pixel art details
        ctx.fillStyle = '#A0522D';
        for (let i = 0; i < platform.width; i += 8) {
          ctx.fillRect(platform.x + i, platform.y, 6, 4);
        }
      } else if (platform.type === 'crumbling') {
        ctx.fillStyle = '#CD853F';
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
        // Add cracks
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(platform.x + 10, platform.y, 2, platform.height);
        ctx.fillRect(platform.x + 30, platform.y, 2, platform.height);
      } else if (platform.type === 'moving') {
        ctx.fillStyle = '#4169E1';
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
        // Add glow effect
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(platform.x + 2, platform.y + 2, platform.width - 4, 4);
      }
    });

    // Draw tokens with animation
    tokens.forEach(token => {
      if (!token.collected) {
        const bounce = Math.sin(token.animationFrame * 0.2) * 3;
        const x = token.x;
        const y = token.y + bounce;
        
        if (token.type === 'shopify') {
          // Shopify token - green with S
          ctx.fillStyle = '#00D4AA';
          ctx.beginPath();
          ctx.arc(x + token.width/2, y + token.height/2, token.width/2, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = 'white';
          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('S', x + token.width/2, y + token.height/2 + 4);
        } else {
          // Gem token - golden with sparkle
          ctx.fillStyle = '#FFD700';
          ctx.fillRect(x + 4, y + 2, 12, 16);
          ctx.fillRect(x + 2, y + 6, 16, 8);
          
          // Sparkle effect
          if (token.animationFrame % 30 < 15) {
            ctx.fillStyle = '#FFFF00';
            ctx.fillRect(x + 8, y, 4, 4);
            ctx.fillRect(x + 16, y + 8, 4, 4);
          }
        }
      }
    });

    // Draw enemies with pixel art animations
    enemies.forEach(enemy => {
      if (enemy.active) {
        const frame = enemy.animationFrame;
        
        if (enemy.type === 'magentoBot') {
          // Magento Bot - Rust Engine of Chaos
          // Main body - boxy and modular like plugins jammed together
          ctx.fillStyle = '#CD853F'; // Bronze/rust color
          ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
          
          // Rust patches and decay
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(enemy.x + 2, enemy.y + 2, 6, 6);
          ctx.fillRect(enemy.x + 24, enemy.y + 8, 4, 8);
          ctx.fillRect(enemy.x + 8, enemy.y + 24, 8, 4);
          
          // Head module
          ctx.fillStyle = '#FF6B35'; // Corrupted orange
          ctx.fillRect(enemy.x + 6, enemy.y + 2, 20, 12);
          
          // Body segments (plugin modules)
          ctx.fillStyle = '#A0522D';
          ctx.fillRect(enemy.x + 4, enemy.y + 16, 10, 8);
          ctx.fillStyle = '#D2691E';
          ctx.fillRect(enemy.x + 18, enemy.y + 16, 10, 8);
          
          // Glitched LED eyes with syntax errors
          if (enemy.state === 'damage' || Math.random() < 0.1) {
            ctx.fillStyle = '#FF0000';
            ctx.font = '6px monospace';
            ctx.fillText('<?', enemy.x + 8, enemy.y + 8);
            ctx.fillText('!', enemy.x + 20, enemy.y + 8);
          } else {
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(enemy.x + 8, enemy.y + 6, 3, 3);
            ctx.fillRect(enemy.x + 20, enemy.y + 6, 3, 3);
          }
          
          // Extension cables and failing code injectors (arms)
          ctx.strokeStyle = '#666';
          ctx.lineWidth = 2;
          ctx.beginPath();
          // Left arm with cable
          ctx.moveTo(enemy.x, enemy.y + 18);
          ctx.lineTo(enemy.x - 4 + Math.sin(frame * 0.3) * 2, enemy.y + 22);
          // Right arm with injector
          ctx.moveTo(enemy.x + 32, enemy.y + 18);
          ctx.lineTo(enemy.x + 36 + Math.sin(frame * 0.3 + 1) * 2, enemy.y + 22);
          ctx.stroke();
          
          // Trailing broken script tags
          if (frame % 20 < 10) {
            ctx.fillStyle = '#666';
            ctx.font = '8px monospace';
            ctx.fillText('</>', enemy.x - 10, enemy.y + 30);
          }
          
          // Memory leak warning (random reboots)
          if (enemy.state === 'damage') {
            ctx.fillStyle = '#FF0000';
            ctx.font = '6px monospace';
            ctx.fillText('MEM LEAK', enemy.x + 2, enemy.y - 2);
          }
          
        } else if (enemy.type === 'salesforceKraken') {
          // Salesforce Kraken - CRM Tentacle Monster
          const floatY = enemy.y + Math.sin(frame * 0.1) * 2;
          
          // Translucent cloud-like body
          const bodyAlpha = 0.7 + Math.sin(frame * 0.15) * 0.2;
          ctx.fillStyle = `rgba(0, 161, 224, ${bodyAlpha})`;
          
          // Main body - no solid form, segmented cloud
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width/2, floatY + 12, 15, 0, Math.PI * 2);
          ctx.fill();
          
          // Icy white highlights
          ctx.fillStyle = `rgba(255, 255, 255, ${bodyAlpha * 0.8})`;
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width/2 - 4, floatY + 8, 6, 0, Math.PI * 2);
          ctx.fill();
          
          // Hollow eyes with spinning API rate limit dials
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.arc(enemy.x + 12, floatY + 8, 4, 0, Math.PI * 2);
          ctx.arc(enemy.x + 28, floatY + 8, 4, 0, Math.PI * 2);
          ctx.fill();
          
          // Spinning rate limit dials inside eyes
          const dialAngle = (frame * 0.2) % (Math.PI * 2);
          ctx.strokeStyle = '#FF6B35';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(enemy.x + 12, floatY + 8, 2, dialAngle, dialAngle + Math.PI);
          ctx.arc(enemy.x + 28, floatY + 8, 2, dialAngle + Math.PI, dialAngle + Math.PI * 2);
          ctx.stroke();
          
          // Floating segmented tentacles wrapped in API endpoints
          for (let i = 0; i < 6; i++) {
            const tentacleX = enemy.x + 4 + i * 6;
            const wave = Math.sin(frame * 0.15 + i * 0.5) * 4;
            const glitchFade = Math.sin(frame * 0.1 + i) * 0.3 + 0.7;
            
            // Tentacle segments
            ctx.fillStyle = `rgba(0, 128, 192, ${glitchFade})`;
            for (let seg = 0; seg < 3; seg++) {
              const segY = floatY + 20 + seg * 8 + wave;
              ctx.fillRect(tentacleX, segY, 4, 6);
              
              // API endpoint labels on tentacles
              if (seg === 1 && i % 2 === 0) {
                ctx.fillStyle = '#FFF';
                ctx.font = '6px monospace';
                ctx.fillText(i < 3 ? 'API' : 'JWT', tentacleX - 2, segY + 4);
                ctx.fillStyle = `rgba(0, 128, 192, ${glitchFade})`;
              }
            }
          }
          
          // Login tokens and permissions pop-ups floating around
          const tokenFloat = Math.sin(frame * 0.12) * 3;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillRect(enemy.x - 5, floatY + 5 + tokenFloat, 12, 8);
          ctx.fillRect(enemy.x + 35, floatY + 15 - tokenFloat, 12, 8);
          
          ctx.fillStyle = '#333';
          ctx.font = '6px monospace';
          ctx.fillText('OAuth', enemy.x - 4, floatY + 10 + tokenFloat);
          ctx.fillText('401', enemy.x + 36, floatY + 20 - tokenFloat);
          
          // Damage animation - shrink and show "401 Unauthorized"
          if (enemy.state === 'damage') {
            ctx.fillStyle = '#FF0000';
            ctx.font = '8px monospace';
            ctx.fillText('401 UNAUTHORIZED', enemy.x - 10, floatY - 5);
          }
          
        } else if (enemy.type === 'wooZombie') {
          // WooZombie - Broken Plugin Undead
          // Main body - lopsided and stitched together
          ctx.fillStyle = '#7F54B3'; // Lavender base
          ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
          
          // Dead grey patches
          ctx.fillStyle = '#696969';
          ctx.fillRect(enemy.x + 2, enemy.y + 6, 6, 8);
          ctx.fillRect(enemy.x + 16, enemy.y + 18, 8, 6);
          ctx.fillRect(enemy.x + 4, enemy.y + 28, 6, 4);
          
          // Head - lopsided
          ctx.fillStyle = '#6B4C93';
          ctx.fillRect(enemy.x + 3, enemy.y + 2, 18, 14); // Slightly off-center head
          
          // Body segments
          ctx.fillStyle = '#8A2BE2';
          ctx.fillRect(enemy.x + 5, enemy.y + 18, 14, 10);
          
          // Plugin boxes sticking out (Yoast SEO, Jetpack, Contact Form 7)
          ctx.fillStyle = '#9966CC';
          // Yoast SEO plugin
          ctx.fillRect(enemy.x + 22, enemy.y + 6, 8, 8);
          ctx.fillStyle = '#FFF';
          ctx.font = '6px monospace';
          ctx.fillText('Y', enemy.x + 24, enemy.y + 11);
          
          // Jetpack plugin
          ctx.fillStyle = '#32CD32';
          ctx.fillRect(enemy.x + 24, enemy.y + 16, 6, 10);
          ctx.fillStyle = '#FFF';
          ctx.fillText('J', enemy.x + 25, enemy.y + 22);
          
          // Contact Form 7 plugin
          ctx.fillStyle = '#FF6347';
          ctx.fillRect(enemy.x - 2, enemy.y + 12, 6, 8);
          ctx.fillStyle = '#FFF';
          ctx.fillText('7', enemy.x - 1, enemy.y + 17);
          
          // Dead pixel eyes with loading spinners
          ctx.fillStyle = '#000';
          ctx.fillRect(enemy.x + 8, enemy.y + 8, 3, 3);
          ctx.fillRect(enemy.x + 16, enemy.y + 8, 3, 3);
          
          // Loading spinners in eyes
          const spinAngle = (frame * 0.3) % (Math.PI * 2);
          ctx.strokeStyle = '#32CD32';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(enemy.x + 9, enemy.y + 9, 1, spinAngle, spinAngle + Math.PI);
          ctx.arc(enemy.x + 17, enemy.y + 9, 1, spinAngle + Math.PI, spinAngle + Math.PI * 2);
          ctx.stroke();
          
          // Lurching animation with delayed jump
          const lurchCycle = frame % 60;
          let lurchOffset = 0;
          if (lurchCycle < 20) {
            lurchOffset = 1;
          } else if (lurchCycle >= 40 && lurchCycle < 45) {
            lurchOffset = -2; // Delayed jump
          }
          
          // Feet
          ctx.fillStyle = '#4A4A4A';
          ctx.fillRect(enemy.x + 2 + lurchOffset, enemy.y + 32, 8, 4); // Left foot
          ctx.fillRect(enemy.x + 18 - lurchOffset, enemy.y + 32, 8, 4); // Right foot
          
          // Glitch green accents
          if (frame % 30 < 5) {
            ctx.fillStyle = '#32CD32';
            ctx.fillRect(enemy.x + 1, enemy.y + 1, 2, 2);
            ctx.fillRect(enemy.x + 25, enemy.y + 3, 2, 2);
          }
          
          // Moaning and shaking effect
          if (Math.random() < 0.05) {
            const shake = Math.random() * 2 - 1;
            ctx.translate(shake, shake);
          }
          
          // Death animation - collapse into deprecated code
          if (enemy.state === 'damage') {
            ctx.fillStyle = '#666';
            ctx.font = '8px monospace';
            ctx.fillText('DEPRECATED', enemy.x - 5, enemy.y - 5);
            
            // Spinning WordPress wheels
            const wheelAngle = (frame * 0.5) % (Math.PI * 2);
            ctx.strokeStyle = '#21759B';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(enemy.x + 14, enemy.y + 16, 6, wheelAngle, wheelAngle + Math.PI);
            ctx.stroke();
          }
        }
      }
    });

    // Draw power-ups with glow effect
    powerUps.forEach(powerUp => {
      if (!powerUp.collected) {
        const glow = Math.sin(powerUp.animationFrame * 0.3) * 0.5 + 0.5;
        
        ctx.fillStyle = '#7C3AED';
        ctx.fillRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height);
        
        // Glow effect
        ctx.fillStyle = `rgba(124, 58, 237, ${glow * 0.5})`;
        ctx.fillRect(powerUp.x - 2, powerUp.y - 2, powerUp.width + 4, powerUp.height + 4);
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        
        if (powerUp.type === 'themeBooster') {
          ctx.fillText('T', powerUp.x + powerUp.width/2, powerUp.y + powerUp.height/2 + 3);
        } else if (powerUp.type === 'checkoutDash') {
          ctx.fillText('D', powerUp.x + powerUp.width/2, powerUp.y + powerUp.height/2 + 3);
        } else if (powerUp.type === 'appMagnet') {
          ctx.fillText('M', powerUp.x + powerUp.width/2, powerUp.y + powerUp.height/2 + 3);
        }
      }
    });

    // Draw particles
    particles.forEach(particle => {
      const alpha = particle.life / particle.maxLife;
      ctx.fillStyle = particle.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
      
      if (particle.type === 'spark') {
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
      } else if (particle.type === 'dust') {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size/2, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.type === 'explosion') {
        ctx.fillRect(particle.x - particle.size/2, particle.y - particle.size/2, particle.size, particle.size);
      }
    });

    // Draw player (Shopee) with detailed pixel art
    const drawShopee = () => {
      const frame = player.animationFrame;
      const isInvulnerable = player.invulnerable > 0 && Math.floor(player.invulnerable / 5) % 2;
      
      if (isInvulnerable) {
        ctx.globalAlpha = 0.5;
      }
      
      // Shopee - The Shopify Hero with detailed pixel art
      
      // Green hoodie shaped like Shopify shopping bag (rounded top, slightly tilted)
      ctx.fillStyle = '#00D4AA'; // Shopify green
      ctx.fillRect(player.x + 5, player.y + 6, 22, 14); // Main hoodie body
      
      // Rounded top of hoodie (shopping bag handle reference)
      ctx.fillRect(player.x + 7, player.y + 4, 18, 4);
      ctx.fillRect(player.x + 9, player.y + 2, 14, 4);
      
      // Soft green-to-white gradient effect on hoodie
      ctx.fillStyle = '#4DFFCD'; // Lighter green highlight
      ctx.fillRect(player.x + 6, player.y + 7, 20, 3);
      ctx.fillRect(player.x + 8, player.y + 4, 16, 2);
      
      // Head - large expressive design
      ctx.fillStyle = '#FFE4B5'; // Skin tone
      ctx.fillRect(player.x + 8, player.y + 8, 16, 16);
      
      // Helmet-like hood referencing shopping bag handle
      ctx.fillStyle = '#00D4AA';
      ctx.fillRect(player.x + 6, player.y + 6, 20, 8);
      ctx.fillStyle = '#4DFFCD';
      ctx.fillRect(player.x + 7, player.y + 7, 18, 2); // Hood highlight
      
      // Signature white 'S' on chest/hood
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('S', player.x + 16, player.y + 16);
      
      // Large expressive eyes (white with black pupils)
      ctx.fillStyle = 'white';
      ctx.fillRect(player.x + 9, player.y + 11, 4, 4);
      ctx.fillRect(player.x + 19, player.y + 11, 4, 4);
      
      // Black pupils with personality
      if (player.state === 'damage') {
        // Closed eyes (X shape for damage)
        ctx.fillStyle = '#000';
        ctx.fillRect(player.x + 10, player.y + 12, 1, 1);
        ctx.fillRect(player.x + 12, player.y + 12, 1, 1);
        ctx.fillRect(player.x + 11, player.y + 13, 1, 1);
        ctx.fillRect(player.x + 20, player.y + 12, 1, 1);
        ctx.fillRect(player.x + 22, player.y + 12, 1, 1);
        ctx.fillRect(player.x + 21, player.y + 13, 1, 1);
        
        // "404" flashes over him
        if (frame % 10 < 5) {
          ctx.fillStyle = '#FF0000';
          ctx.font = 'bold 8px monospace';
          ctx.fillText('404', player.x + 16, player.y + 4);
        }
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(player.x + 10, player.y + 12, 2, 2);
        ctx.fillRect(player.x + 20, player.y + 12, 2, 2);
      }
      
      // Slim but heroic build body
      ctx.fillStyle = '#00D4AA';
      ctx.fillRect(player.x + 6, player.y + 20, 20, 16);
      
      // Body highlights
      ctx.fillStyle = '#4DFFCD';
      ctx.fillRect(player.x + 7, player.y + 21, 18, 2);
      
      // Cape with S logo (startup founder attitude)
      if (player.facing === 'right') {
        ctx.fillStyle = '#00D4AA';
        ctx.fillRect(player.x + 28, player.y + 10, 4, 18);
        ctx.fillStyle = '#4DFFCD';
        ctx.fillRect(player.x + 28, player.y + 11, 3, 2); // Cape highlight
        ctx.fillStyle = 'white';
        ctx.font = 'bold 8px monospace';
        ctx.fillText('S', player.x + 30, player.y + 20);
      } else {
        ctx.fillStyle = '#00D4AA';
        ctx.fillRect(player.x - 4, player.y + 10, 4, 18);
        ctx.fillStyle = '#4DFFCD';
        ctx.fillRect(player.x - 3, player.y + 11, 3, 2);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 8px monospace';
        ctx.fillText('S', player.x - 2, player.y + 20);
      }
      
      // White modern-looking sneakers (for speed & clean design)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(player.x + 6, player.y + 40, 8, 8);
      ctx.fillRect(player.x + 18, player.y + 40, 8, 8);
      
      // Sneaker details (modern design)
      ctx.fillStyle = '#E0E0E0';
      ctx.fillRect(player.x + 7, player.y + 41, 6, 2); // Left shoe highlight
      ctx.fillRect(player.x + 19, player.y + 41, 6, 2); // Right shoe highlight
      
      // Animation-specific details
      if (player.state === 'idle') {
        // Light bounce
        const bounce = Math.sin(frame * 0.15) * 1.5;
        ctx.translate(0, bounce);
        
        // Typing animation or scanning UI
        const typing = frame % 80 < 40;
        if (typing) {
          // Typing hands
          ctx.fillStyle = '#FFE4B5';
          ctx.fillRect(player.x + 4, player.y + 28, 4, 6);
          ctx.fillRect(player.x + 24, player.y + 28, 4, 6);
          
          // UI scanning effect
          ctx.fillStyle = '#00D4AA';
          ctx.fillRect(player.x + 8, player.y + 32, 16, 1);
          if (frame % 20 < 10) {
            ctx.fillRect(player.x + 10, player.y + 34, 12, 1);
          }
        }
        
      } else if (player.state === 'running') {
        // Smooth arm swings, slightly exaggerated lean forward
        const armSwing = Math.sin(frame * 0.6) * 3;
        const lean = 1;
        ctx.translate(player.facing === 'right' ? lean : -lean, 0);
        
        ctx.fillStyle = '#FFE4B5';
        if (player.facing === 'right') {
          ctx.fillRect(player.x + 2, player.y + 22 + armSwing, 4, 8); // Left arm
          ctx.fillRect(player.x + 26, player.y + 22 - armSwing, 4, 8); // Right arm
        } else {
          ctx.fillRect(player.x + 26, player.y + 22 + armSwing, 4, 8);
          ctx.fillRect(player.x + 2, player.y + 22 - armSwing, 4, 8);
        }
        
      } else if (player.state === 'jumping') {
        // Mid-air stretch
        ctx.translate(0, -2);
        
        // Arms up in heroic pose
        ctx.fillStyle = '#FFE4B5';
        ctx.fillRect(player.x + 2, player.y + 14, 4, 10); // Left arm up
        ctx.fillRect(player.x + 26, player.y + 14, 4, 10); // Right arm up
        
        // Subtle pixel trail under shoes
        if (player.velocityY > 0) {
          ctx.fillStyle = 'rgba(0, 212, 170, 0.6)';
          ctx.fillRect(player.x + 8, player.y + 50, 2, 4);
          ctx.fillRect(player.x + 22, player.y + 50, 2, 4);
          ctx.fillStyle = 'rgba(0, 212, 170, 0.3)';
          ctx.fillRect(player.x + 9, player.y + 54, 1, 2);
          ctx.fillRect(player.x + 23, player.y + 54, 1, 2);
        }
        
      } else if (player.state === 'dashing') {
        // Leaning forward with speed lines
        const lean = 3;
        ctx.translate(player.facing === 'right' ? lean : -lean, 0);
        
        // Speed lines
        ctx.strokeStyle = '#7C3AED';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          const lineX = player.x + (player.facing === 'right' ? -8 - i * 4 : 40 + i * 4);
          ctx.moveTo(lineX, player.y + 12 + i * 3);
          ctx.lineTo(lineX + (player.facing === 'right' ? -6 : 6), player.y + 16 + i * 3);
          ctx.stroke();
        }
        
      } else if (player.state === 'damage') {
        // Screen glitch effect
        const glitch = Math.random() * 4 - 2;
        ctx.translate(glitch, glitch * 0.5);
        
        // Leaning back
        ctx.translate(player.facing === 'right' ? -2 : 2, 0);
      }
      
      // Victory pose (when reaching goal)
      if (player.x >= 1140 && player.y >= 450) {
        // Raised arm holding a "Shopify Token"
        ctx.fillStyle = '#FFE4B5';
        ctx.fillRect(player.x + 16, player.y + 2, 4, 12); // Raised arm
        
        // Shopify token
        ctx.fillStyle = '#00D4AA';
        ctx.beginPath();
        ctx.arc(player.x + 18, player.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 8px monospace';
        ctx.fillText('S', player.x + 18, player.y + 3);
      }
      
      ctx.globalAlpha = 1;
    };
    
    drawShopee();

    // Draw goal area
    ctx.fillStyle = '#00D4AA';
    ctx.fillRect(1150, 500, 50, 50);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', 1175, 520);
    ctx.fillText('🏆', 1175, 535);

    // Restore context if screen shake was applied
    if (gameState.screenShake > 0) {
      ctx.restore();
    }

  }, [player, tokens, enemies, powerUps, platforms, particles, backgroundLayers, gameState.currentLevel, gameState.screenShake]);

  // Game loop
  useEffect(() => {
    const gameLoop = () => {
      if (!gameState.paused && !gameState.gameOver) {
        updatePlayer();
        updateTokens();
        updateEnemies();
        updatePowerUps();
        updateParticles();
        updateBackground();
        
        // Check victory condition
        if (player.x >= 1150 && player.y >= 450) {
          setGameState(gs => ({ ...gs, victory: true }));
        }
        
        // Check game over condition
        if (player.health <= 0) {
          setGameState(gs => ({ ...gs, gameOver: true }));
        }
        
        // Update timer
        setGameState(gs => ({ ...gs, time: gs.time + 1/60 }));
      }
      
      render();
      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [updatePlayer, updateTokens, updateEnemies, updatePowerUps, updateParticles, updateBackground, render, gameState.paused, gameState.gameOver, player.x, player.y, player.health]);

  const togglePause = () => {
    setGameState(gs => ({ ...gs, paused: !gs.paused }));
  };

  const toggleMusic = () => {
    setGameState(gs => ({ ...gs, musicEnabled: !gs.musicEnabled }));
    if (!gameState.musicEnabled) {
      startBackgroundMusic();
    }
  };

  const toggleSFX = () => {
    setGameState(gs => ({ ...gs, sfxEnabled: !gs.sfxEnabled }));
  };

  const resetGame = () => {
    setGameState({
      level: 1,
      score: 0,
      tokens: 0,
      time: 0,
      paused: false,
      gameOver: false,
      victory: false,
      currentLevel: 'magento',
      screenShake: 0,
      cameraX: 0,
      musicEnabled: gameState.musicEnabled,
      sfxEnabled: gameState.sfxEnabled
    });
    
    setPlayer({
      x: 100,
      y: 400,
      width: 32,
      height: 48,
      velocityX: 0,
      velocityY: 0,
      onGround: false,
      facing: 'right',
      state: 'idle',
      canDoubleJump: true,
      hasDoubleJumped: false,
      dashCooldown: 0,
      health: 3,
      coyoteTime: 0,
      jumpBuffer: 0,
      animationFrame: 0,
      animationTimer: 0,
      invulnerable: 0
    });

    setTokens(prev => prev.map(token => ({ ...token, collected: false, animationFrame: 0 })));
    setEnemies(prev => prev.map(enemy => ({ 
      ...enemy, 
      active: true, 
      health: enemy.type === 'magentoBot' ? 2 : enemy.type === 'salesforceKraken' ? 3 : 2,
      animationFrame: 0,
      animationTimer: 0,
      state: enemy.type === 'salesforceKraken' ? 'idle' : 'walk'
    })));
    setPowerUps(prev => prev.map(powerUp => ({ ...powerUp, collected: false, animationFrame: 0 })));
    setParticles([]);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-green-400 mb-2 pixel-font">
            Shopee: Legacy Platform Escape
          </h1>
          <p className="text-gray-300">
            Help Shopee migrate from legacy platforms to the clean world of Shopify!
          </p>
        </div>

        {/* Game Stats */}
        <div className="flex justify-center gap-4 mb-4 flex-wrap">
          <Badge variant="secondary" className="text-lg px-4 py-2">
            Level: {gameState.currentLevel.toUpperCase()}
          </Badge>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            Score: {gameState.score}
          </Badge>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            Tokens: {gameState.tokens}
          </Badge>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            Health: {'❤️'.repeat(Math.max(0, player.health))}
          </Badge>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            Time: {Math.floor(gameState.time)}s
          </Badge>
        </div>

        {/* Game Controls */}
        <div className="flex justify-center gap-2 mb-4 flex-wrap">
          <Button onClick={togglePause} variant="outline">
            {gameState.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {gameState.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button onClick={resetGame} variant="outline">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button onClick={toggleMusic} variant="outline">
            {gameState.musicEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            Music
          </Button>
          <Button onClick={toggleSFX} variant="outline">
            {gameState.sfxEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            SFX
          </Button>
        </div>

        {/* Game Canvas */}
        <Card className="mx-auto w-fit p-4 bg-gray-800 border-gray-700 retro-border">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-gray-600 rounded-lg scanlines"
            style={{ imageRendering: 'pixelated' }}
          />
        </Card>

        {/* Controls Instructions */}
        <div className="mt-6 text-center">
          <h3 className="text-xl font-semibold mb-3 text-green-400 pixel-font">Controls</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
            <div className="bg-gray-800 p-3 rounded-lg">
              <div className="font-mono text-green-400">A / ←</div>
              <div className="text-sm text-gray-300">Move Left</div>
            </div>
            <div className="bg-gray-800 p-3 rounded-lg">
              <div className="font-mono text-green-400">D / →</div>
              <div className="text-sm text-gray-300">Move Right</div>
            </div>
            <div className="bg-gray-800 p-3 rounded-lg">
              <div className="font-mono text-green-400">W / ↑ / Space</div>
              <div className="text-sm text-gray-300">Jump / Double Jump</div>
            </div>
            <div className="bg-gray-800 p-3 rounded-lg">
              <div className="font-mono text-green-400">Shift</div>
              <div className="text-sm text-gray-300">Dash Attack</div>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-400">
            <p>💡 <strong>Pro Tips:</strong> Use coyote time to jump after leaving platforms! Hold jump for higher jumps! Dash through enemies to defeat them!</p>
          </div>
        </div>

        {/* Game Over / Victory Screens */}
        {gameState.gameOver && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <Card className="p-8 text-center bg-gray-800 border-red-500 retro-border">
              <h2 className="text-3xl font-bold text-red-400 mb-4 pixel-font">Migration Failed!</h2>
              <p className="text-gray-300 mb-4">
                The legacy platforms got the better of you. Try again!
              </p>
              <div className="text-lg mb-4">
                <div>Final Score: {gameState.score}</div>
                <div>Time Survived: {Math.floor(gameState.time)}s</div>
                <div>Tokens Collected: {gameState.tokens}</div>
              </div>
              <Button onClick={resetGame} className="bg-red-600 hover:bg-red-700">
                Retry Migration
              </Button>
            </Card>
          </div>
        )}

        {gameState.victory && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <Card className="p-8 text-center bg-gray-800 border-green-500 retro-border glow-animation">
              <h2 className="text-3xl font-bold text-green-400 mb-4 pixel-font">Migration Successful!</h2>
              <p className="text-gray-300 mb-4">
                🎉 Congratulations! You've successfully migrated to Shopify! 🎉
              </p>
              <div className="text-lg mb-4">
                <div>Final Score: <span className="text-green-400">{gameState.score}</span></div>
                <div>Completion Time: <span className="text-blue-400">{Math.floor(gameState.time)}s</span></div>
                <div>Tokens Collected: <span className="text-yellow-400">{gameState.tokens}</span></div>
                <div className="mt-2">
                  <Badge variant="secondary" className="text-lg">
                    Rank: {gameState.score > 1000 ? '🏆 Master Migrator' : gameState.score > 500 ? '🥈 Platform Pro' : '🥉 Digital Nomad'}
                  </Badge>
                </div>
              </div>
              <Button onClick={resetGame} className="bg-green-600 hover:bg-green-700">
                Play Again
              </Button>
            </Card>
          </div>
        )}

        {/* Story Context */}
        <div className="mt-8 max-w-4xl mx-auto">
          <Card className="p-6 bg-gray-800 border-gray-700">
            <h3 className="text-xl font-semibold mb-3 text-green-400 pixel-font">Mission Briefing</h3>
            <p className="text-gray-300 leading-relaxed mb-4">
              You are <span className="text-blue-400 font-semibold">Shopee</span>, a futuristic e-commerce ninja on a critical mission. 
              The digital world is plagued by legacy platforms - slow, buggy, and inefficient systems that trap businesses 
              in outdated technology.
            </p>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="bg-orange-900 bg-opacity-30 p-3 rounded">
                <h4 className="font-semibold text-orange-400 mb-2">🤖 Magento Bot</h4>
                <p className="text-gray-300">Rusty orange robots with hanging wires. They glitch randomly and move sluggishly through the maze.</p>
              </div>
              <div className="bg-blue-900 bg-opacity-30 p-3 rounded">
                <h4 className="font-semibold text-blue-400 mb-2">🐙 Salesforce Kraken</h4>
                <p className="text-gray-300">Cloudy blue tentacle monsters made of tangled APIs. They drift like jellyfish with floating login tokens.</p>
              </div>
              <div className="bg-purple-900 bg-opacity-30 p-3 rounded">
                <h4 className="font-semibold text-purple-400 mb-2">🧟 WooZombie</h4>
                <p className="text-gray-300">Purple zombies built from broken WordPress plugins. They lurch slowly with plugin blocks on their backs.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default GameEngine;