import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Play, Pause, RotateCcw } from 'lucide-react';

// Game constants
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 600;
const GRAVITY = 0.8;
const JUMP_FORCE = -15;
const MOVE_SPEED = 5;
const DASH_SPEED = 12;

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
  state: 'idle' | 'running' | 'jumping' | 'dashing';
  canDoubleJump: boolean;
  hasDoubleJumped: boolean;
  dashCooldown: number;
  health: number;
}

interface Token {
  x: number;
  y: number;
  width: number;
  height: number;
  collected: boolean;
  type: 'shopify' | 'gem';
  value: number;
}

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'normal' | 'crumbling' | 'moving';
}

interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  type: 'bugBot' | 'extensionSnake' | 'crmKraken';
  health: number;
  active: boolean;
}

interface PowerUp {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'themeBooster' | 'checkoutDash' | 'appMagnet';
  collected: boolean;
  duration: number;
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
}

const GameEngine: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const keysRef = useRef<Set<string>>(new Set());
  
  // Game state
  const [gameState, setGameState] = useState<GameState>({
    level: 1,
    score: 0,
    tokens: 0,
    time: 0,
    paused: false,
    gameOver: false,
    victory: false,
    currentLevel: 'magento'
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
    canDoubleJump: false,
    hasDoubleJumped: false,
    dashCooldown: 0,
    health: 3
  });

  const [platforms] = useState<Platform[]>([
    // Ground platforms
    { x: 0, y: 550, width: 300, height: 50, type: 'normal' },
    { x: 400, y: 450, width: 200, height: 20, type: 'normal' },
    { x: 700, y: 350, width: 150, height: 20, type: 'crumbling' },
    { x: 950, y: 250, width: 200, height: 20, type: 'normal' },
    { x: 1150, y: 550, width: 50, height: 50, type: 'normal' }, // Goal platform
  ]);

  const [tokens, setTokens] = useState<Token[]>([
    { x: 450, y: 400, width: 20, height: 20, collected: false, type: 'shopify', value: 10 },
    { x: 750, y: 300, width: 20, height: 20, collected: false, type: 'shopify', value: 10 },
    { x: 1000, y: 200, width: 20, height: 20, collected: false, type: 'gem', value: 50 },
    { x: 200, y: 500, width: 20, height: 20, collected: false, type: 'shopify', value: 10 },
  ]);

  const [enemies, setEnemies] = useState<Enemy[]>([
    { x: 500, y: 400, width: 24, height: 24, velocityX: -1, velocityY: 0, type: 'bugBot', health: 1, active: true },
    { x: 800, y: 300, width: 32, height: 16, velocityX: 0, velocityY: 0, type: 'extensionSnake', health: 2, active: true },
  ]);

  const [powerUps, setPowerUps] = useState<PowerUp[]>([
    { x: 600, y: 400, width: 24, height: 24, type: 'themeBooster', collected: false, duration: 0 },
  ]);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
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

      // Handle input
      if (keys.has('a') || keys.has('arrowleft')) {
        newPlayer.velocityX = -MOVE_SPEED;
        newPlayer.facing = 'left';
        newPlayer.state = newPlayer.onGround ? 'running' : 'jumping';
      } else if (keys.has('d') || keys.has('arrowright')) {
        newPlayer.velocityX = MOVE_SPEED;
        newPlayer.facing = 'right';
        newPlayer.state = newPlayer.onGround ? 'running' : 'jumping';
      } else {
        newPlayer.velocityX *= 0.8; // Friction
        if (newPlayer.onGround && Math.abs(newPlayer.velocityX) < 0.1) {
          newPlayer.state = 'idle';
          newPlayer.velocityX = 0;
        }
      }

      // Jumping
      if ((keys.has('w') || keys.has('arrowup') || keys.has(' ')) && 
          (newPlayer.onGround || (!newPlayer.hasDoubleJumped && newPlayer.canDoubleJump))) {
        if (!newPlayer.onGround && newPlayer.canDoubleJump) {
          newPlayer.hasDoubleJumped = true;
        }
        newPlayer.velocityY = JUMP_FORCE;
        newPlayer.onGround = false;
        newPlayer.state = 'jumping';
      }

      // Dashing
      if (keys.has('shift') && newPlayer.dashCooldown <= 0) {
        newPlayer.velocityX = newPlayer.facing === 'right' ? DASH_SPEED : -DASH_SPEED;
        newPlayer.state = 'dashing';
        newPlayer.dashCooldown = 60; // 1 second at 60fps
      }

      // Apply gravity
      if (!newPlayer.onGround) {
        newPlayer.velocityY += GRAVITY;
      }

      // Update position
      newPlayer.x += newPlayer.velocityX;
      newPlayer.y += newPlayer.velocityY;

      // Platform collision
      newPlayer.onGround = false;
      platforms.forEach(platform => {
        if (checkCollision(newPlayer, platform)) {
          // Landing on top of platform
          if (newPlayer.velocityY > 0 && newPlayer.y < platform.y) {
            newPlayer.y = platform.y - newPlayer.height;
            newPlayer.velocityY = 0;
            newPlayer.onGround = true;
            newPlayer.hasDoubleJumped = false;
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
      }

      // Update cooldowns
      if (newPlayer.dashCooldown > 0) newPlayer.dashCooldown--;

      return newPlayer;
    });
  }, [gameState.paused, gameState.gameOver, platforms]);

  // Update tokens and collectibles
  const updateTokens = useCallback(() => {
    setTokens(prev => prev.map(token => {
      if (!token.collected && checkCollision(player, token)) {
        setGameState(gs => ({
          ...gs,
          tokens: gs.tokens + 1,
          score: gs.score + token.value
        }));
        return { ...token, collected: true };
      }
      return token;
    }));
  }, [player]);

  // Update enemies
  const updateEnemies = useCallback(() => {
    setEnemies(prev => prev.map(enemy => {
      if (!enemy.active) return enemy;

      const newEnemy = { ...enemy };

      // Simple AI movement
      if (enemy.type === 'bugBot') {
        newEnemy.x += newEnemy.velocityX;
        // Bounce off edges
        if (newEnemy.x <= 0 || newEnemy.x >= CANVAS_WIDTH - newEnemy.width) {
          newEnemy.velocityX *= -1;
        }
      }

      // Check collision with player
      if (checkCollision(player, newEnemy)) {
        // Player takes damage
        setPlayer(p => ({ ...p, health: p.health - 1 }));
      }

      return newEnemy;
    }));
  }, [player]);

  // Render function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with level-specific background
    const bgColors = {
      magento: '#FF6B35',
      salesforce: '#00A1E0',
      woocommerce: '#7F54B3',
      boss: '#2C3E50'
    };
    
    ctx.fillStyle = bgColors[gameState.currentLevel];
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw platforms
    ctx.fillStyle = '#8B4513';
    platforms.forEach(platform => {
      ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
      
      // Add platform styling based on type
      if (platform.type === 'crumbling') {
        ctx.fillStyle = '#CD853F';
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
        ctx.fillStyle = '#8B4513';
      }
    });

    // Draw tokens
    tokens.forEach(token => {
      if (!token.collected) {
        ctx.fillStyle = token.type === 'shopify' ? '#00D4AA' : '#FFD700';
        ctx.beginPath();
        ctx.arc(token.x + token.width/2, token.y + token.height/2, token.width/2, 0, Math.PI * 2);
        ctx.fill();
        
        // Add 'S' for Shopify tokens
        if (token.type === 'shopify') {
          ctx.fillStyle = 'white';
          ctx.font = '12px Inter';
          ctx.textAlign = 'center';
          ctx.fillText('S', token.x + token.width/2, token.y + token.height/2 + 4);
        }
      }
    });

    // Draw enemies
    enemies.forEach(enemy => {
      if (enemy.active) {
        if (enemy.type === 'bugBot') {
          ctx.fillStyle = '#FF4444';
          ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
          // Add bug-like details
          ctx.fillStyle = '#000';
          ctx.fillRect(enemy.x + 4, enemy.y + 4, 4, 4);
          ctx.fillRect(enemy.x + 16, enemy.y + 4, 4, 4);
        } else if (enemy.type === 'extensionSnake') {
          ctx.fillStyle = '#8B008B';
          ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        }
      }
    });

    // Draw power-ups
    powerUps.forEach(powerUp => {
      if (!powerUp.collected) {
        ctx.fillStyle = '#7C3AED';
        ctx.fillRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height);
        ctx.fillStyle = 'white';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('P', powerUp.x + powerUp.width/2, powerUp.y + powerUp.height/2 + 3);
      }
    });

    // Draw player (Shopee)
    ctx.fillStyle = '#4A90E2'; // Blue jumpsuit
    ctx.fillRect(player.x, player.y, player.width, player.height);
    
    // Add cape (S logo)
    ctx.fillStyle = '#00D4AA';
    ctx.fillRect(player.x + player.width - 8, player.y, 8, 20);
    ctx.fillStyle = 'white';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('S', player.x + player.width - 4, player.y + 14);

    // Player face/details
    ctx.fillStyle = '#FFE4B5';
    ctx.fillRect(player.x + 8, player.y + 8, 16, 16);
    
    // Eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(player.x + 10, player.y + 12, 2, 2);
    ctx.fillRect(player.x + 18, player.y + 12, 2, 2);

    // Show typing animation when idle
    if (player.state === 'idle') {
      ctx.fillStyle = '#666';
      ctx.fillRect(player.x + 6, player.y + 30, 8, 4);
      ctx.fillRect(player.x + 18, player.y + 30, 8, 4);
    }

    // Draw goal area
    ctx.fillStyle = '#00D4AA';
    ctx.fillRect(1150, 500, 50, 50);
    ctx.fillStyle = 'white';
    ctx.font = '16px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', 1175, 530);

  }, [player, tokens, enemies, powerUps, platforms, gameState.currentLevel]);

  // Game loop
  useEffect(() => {
    const gameLoop = () => {
      if (!gameState.paused && !gameState.gameOver) {
        updatePlayer();
        updateTokens();
        updateEnemies();
        
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
  }, [updatePlayer, updateTokens, updateEnemies, render, gameState.paused, gameState.gameOver, player.x, player.y, player.health]);

  const togglePause = () => {
    setGameState(gs => ({ ...gs, paused: !gs.paused }));
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
      currentLevel: 'magento'
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
      canDoubleJump: false,
      hasDoubleJumped: false,
      dashCooldown: 0,
      health: 3
    });

    setTokens(prev => prev.map(token => ({ ...token, collected: false })));
    setEnemies(prev => prev.map(enemy => ({ ...enemy, active: true, health: enemy.type === 'bugBot' ? 1 : 2 })));
    setPowerUps(prev => prev.map(powerUp => ({ ...powerUp, collected: false })));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-green-400 mb-2">
            Shopee: Legacy Platform Escape
          </h1>
          <p className="text-gray-300">
            Help Shopee migrate from legacy platforms to the clean world of Shopify!
          </p>
        </div>

        {/* Game Stats */}
        <div className="flex justify-center gap-4 mb-4">
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
            Health: {'❤️'.repeat(player.health)}
          </Badge>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            Time: {Math.floor(gameState.time)}s
          </Badge>
        </div>

        {/* Game Controls */}
        <div className="flex justify-center gap-2 mb-4">
          <Button onClick={togglePause} variant="outline">
            {gameState.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {gameState.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button onClick={resetGame} variant="outline">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>

        {/* Game Canvas */}
        <Card className="mx-auto w-fit p-4 bg-gray-800 border-gray-700">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-gray-600 rounded-lg"
            style={{ imageRendering: 'pixelated' }}
          />
        </Card>

        {/* Controls Instructions */}
        <div className="mt-6 text-center">
          <h3 className="text-xl font-semibold mb-3 text-green-400">Controls</h3>
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
              <div className="text-sm text-gray-300">Jump</div>
            </div>
            <div className="bg-gray-800 p-3 rounded-lg">
              <div className="font-mono text-green-400">Shift</div>
              <div className="text-sm text-gray-300">Dash</div>
            </div>
          </div>
        </div>

        {/* Game Over / Victory Screens */}
        {gameState.gameOver && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
            <Card className="p-8 text-center bg-gray-800 border-red-500">
              <h2 className="text-3xl font-bold text-red-400 mb-4">Migration Failed!</h2>
              <p className="text-gray-300 mb-4">
                The legacy platforms got the better of you. Try again!
              </p>
              <Button onClick={resetGame} className="bg-red-600 hover:bg-red-700">
                Retry Migration
              </Button>
            </Card>
          </div>
        )}

        {gameState.victory && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
            <Card className="p-8 text-center bg-gray-800 border-green-500">
              <h2 className="text-3xl font-bold text-green-400 mb-4">Migration Successful!</h2>
              <p className="text-gray-300 mb-4">
                Congratulations! You've successfully migrated to Shopify!
              </p>
              <div className="text-lg mb-4">
                <div>Final Score: {gameState.score}</div>
                <div>Time: {Math.floor(gameState.time)}s</div>
                <div>Tokens Collected: {gameState.tokens}</div>
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
            <h3 className="text-xl font-semibold mb-3 text-green-400">Mission Briefing</h3>
            <p className="text-gray-300 leading-relaxed">
              You are <span className="text-blue-400 font-semibold">Shopee</span>, a futuristic e-commerce ninja on a critical mission. 
              The digital world is plagued by legacy platforms - slow, buggy, and inefficient systems that trap businesses 
              in outdated technology. Your goal is to navigate through the treacherous <span className="text-orange-400">Magento Maze</span>, 
              escape the <span className="text-blue-400">Salesforce Sprawl</span>, survive the <span className="text-purple-400">WooCommerce Wasteland</span>, 
              and ultimately defeat <span className="text-red-400">Clunkbot the Monolith</span> to bring businesses into the 
              clean, optimized world of <span className="text-green-400">Shopify</span>.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default GameEngine;