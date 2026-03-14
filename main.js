const BACKEND_URL = 'https://yoyogm.onrender.com'; // 例如：https://socketio-game-backend.onrender.com

// 🔴 关键修改 2：配置 Socket.io 连接，指向 render.com 后端
const socket = io(BACKEND_URL, { 
  transports: ['websocket'], // 强制使用 WebSocket，避免跨域问题
  reconnection: true,        // 自动重连（解决 render 休眠问题）
  reconnectionDelay: 1000,   // 重连间隔 1 秒
  reconnectionDelayMax: 10000, // 最大重连间隔 10 秒
  reconnectionAttempts: Infinity, // 无限重连
  timeout: 20000 // 连接超时 20 秒（适配 render 唤醒延迟）
});
const players = {};
let player;
let cursors;
let myID = null;
let currentPlayersData = null;
let accountData = null;
let initialized = false;
let bullets;
console.log('📦 Socket initialized');

// 🛡️ 初始化 inventory 和子弹数量
const inventory = {
  bullets: ['basic'],
  bulletCounts: { // 🛡️ 新增：每种子弹的数量
    basic: 1,
    stinger: 0,
    dev: 0,
    soil: 0,
    rock: 0,
    // 🛡️ 新增：eta 子弹
    eta_basic: 0,
    eta_stinger: 0,
    eta_dev: 0,
    eta_soil: 0,
    eta_rock: 0
  }
};

let selectedBulletIndex = 0;
let currentBulletType = 'basic';
let inventoryVisible = true;

// 🛡️ 新增：全局 inventory 布局常量
const BULLETS_PER_ROW = 4;      // 每排 4 个
const ICON_SPACING_X = 60;      // 横向间距
const ICON_SPACING_Y = 60;      // 纵向间距
const START_X = 50;             // 起始 X 坐标
const START_Y = 560;            // 起始 Y 坐标（最底层）

window.onload = () => {
  const chatInput = document.getElementById('chatInput');
  const chatContainer = document.getElementById('chatContainer');

  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      socket.emit('chatMessage', chatInput.value.trim());
      chatInput.value = '';
    }
  });

  socket.on('chatBroadcast', msg => {
    const line = document.createElement('div');
    line.textContent = msg;
    chatContainer.appendChild(line);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
};

// Assign myID once connected
socket.on('connect', () => {
  console.log('🌐 Connected to server');
  myID = socket.id;
  console.log(`✅ Assigned myID = ${myID}`);

  // 🛡️ 先登录，再 readyToInit
  const username = prompt("🧑 Enter your username:");
  const password = prompt("🔐 Enter your password:");
  socket.emit('login', { username, password });
});

socket.on('loginFailed', data => {
  alert(`❌ Login failed: ${data.reason}`);
});

// 🛡️ 账号加载后立即设置 inventory 和 bulletCounts
socket.on('accountLoaded', account => {
  accountData = account;
  console.log('🎉 Account loaded:', account.username);
  console.log('🔫 Bullets unlocked:', account.bulletsUnlocked);
  
  // 🛡️ 更新 inventory
  inventory.bullets = account.bulletsUnlocked || ['basic'];
  selectedBulletIndex = 0;
  currentBulletType = inventory.bullets[0];
  
  // 🛡️ 更新子弹数量
  if (account.bulletCounts) {
    inventory.bulletCounts = account.bulletCounts;
  } else {
    // 兼容旧账号
    inventory.bulletCounts = {
      basic: inventory.bullets.includes('basic') ? 1 : 0,
      stinger: 0,
      dev: 0,
      soil: 0,
      rock: 0,
      // 🛡️ 新增：eta 子弹
      eta_basic: 0,
      eta_stinger: 0,
      eta_dev: 0,
      eta_soil: 0,
      eta_rock: 0
    };
  }
  
  console.log('📦 Inventory set to:', inventory.bullets);
  console.log('🔢 Bullet counts:', inventory.bulletCounts);
  console.log('🎯 Current bullet type:', currentBulletType);
  
  // 🛡️ 修复：如果 scene 已经存在，立即重新渲染 inventory
  if (window.gameScene && window.gameScene.inventoryUI) {
    console.log('🎨 Re-rendering inventory after account load...');
    renderInventory(window.gameScene);
  }
});

const bulletConfigs = {
  // 🛡️ theta 子弹（普通版本）
  basic: {
    damage: 10,
    reloadTime: 1000,
    speed: 500,
    icon: 'bullet_basic_icon'
  },
  stinger: {
    damage: 20,
    reloadTime: 2500,
    speed: 700,
    icon: 'bullet_stinger_icon'
  },
  dev:{
    damage: 1000,
    reloadTime: 10,
    speed: 900,
    lifespan: 3000,
    icon: 'bullet_dev_icon'
  },
  soil: {
    damage: 15,
    reloadTime: 3000,
    speed: 10,
    heathadd: 250,
    icon: 'bullet_soil_icon'
  },
  rock: {
    damage: 50,
    reloadTime: 5000,
    speed: 300,
    icon: 'bullet_rock_icon'
  },
  
  // 🛡️ eta 子弹（高伤害版本）- 新增：3 倍伤害，+100ms 装填时间
  // 🛡️ 注意：eta 子弹使用自己的图标，但飞行时复用 theta 的贴图纸
  eta_basic: {
    damage: 30,  // 10 * 3
    reloadTime: 1100,  // 1000 + 100
    speed: 500,
    lifespan: 3000,
    icon: 'bullet_eta_basic_icon',  // eta 图标
    sprite: 'bullet_basic'  // 复用 theta 贴图纸
  },
  eta_stinger: {
    damage: 60,  // 20 * 3
    reloadTime: 2600,  // 2500 + 100
    speed: 700,
    lifespan: 3000,
    icon: 'bullet_eta_stinger_icon',  // eta 图标
    sprite: 'bullet_stinger'  // 复用 theta 贴图纸
  },
  eta_dev: {
    damage: 3000,  // 1000 * 3
    reloadTime: 110,  // 10 + 100
    speed: 900,
    lifespan: 3000,
    icon: 'bullet_eta_dev_icon',  // eta 图标
    sprite: 'bullet_dev'  // 复用 theta 贴图纸
  },
  eta_soil: {
    damage: 45,  // 15 * 3
    reloadTime: 3100,  // 3000 + 100
    speed: 10,
    heathadd: 250,  // 保持不变
    lifespan: 3000,
    icon: 'bullet_eta_soil_icon',  // eta 图标
    sprite: 'bullet_soil'  // 复用 theta 贴图纸
  },
  eta_rock: {
    damage: 150,  // 50 * 3
    reloadTime: 5100,  // 5000 + 100
    speed: 300,
    lifespan: 3000,
    icon: 'bullet_eta_rock_icon',  // eta 图标
    sprite: 'bullet_rock'  // 复用 theta 贴图纸
  }
};

// Handle connection errors
socket.on('connect_error', err => {
  console.error('❌ Socket connection error:', err.message);
});

socket.on('readyToInit', () => {
  console.log('📡 Received readyToInit from server');
  socket.emit('readyToInit');
});

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#4444ff',
  physics: { default: 'arcade' },
  scene: { preload, create, update }
};

const game = new Phaser.Game(config);
console.log('🛠️ Phaser game constructed');

function preload() {
  console.log('📦 preload() - loading assets');
  this.load.image('player', 'shooter.png');
  this.load.image('inventoryToggleBtn', 'pic/button/inventory.png');


  this.load.image('earth', 'pic/mob/earth.png');
  this.load.image('moon', 'pic/mob/moon.png');
  this.load.image('green', 'pic/mob/green.png'); // 🛡️ Add green texture
  
  // 🛡️ theta 子弹（当前普通子弹）
  this.load.image('bullet_dev_icon', 'pic/load/theta/dev.png');
  this.load.image('bullet_dev', 'pic/bull/dev.png');
  this.load.image('bullet_basic_icon', 'pic/load/theta/basic.png');
  this.load.image('bullet_basic', 'pic/bull/basic.png');
  this.load.image('bullet_stinger', 'pic/bull/stinger.png');
  this.load.image('bullet_leaf', 'pic/bull/leaf.png');
  this.load.image('bullet_leaf_icon', 'pic/load/theta/leaf.png');
  this.load.image('bullet_rock', 'pic/bull/rock.png');
  this.load.image('bullet_rock_icon', 'pic/load/theta/rock.png');
  this.load.image('bullet_soil', 'pic/bull/soil.png');
  this.load.image('bullet_soil_icon', 'pic/load/theta/soil.png');
  this.load.image('bullet_stinger_icon', 'pic/load/theta/stinger.png');
  
  // 🛡️ eta 子弹（高伤害版本）- 新增：只加载不同的装备图标，贴图纸复用 theta 的
  this.load.image('bullet_eta_dev_icon', 'pic/load/eta/dev.png');
  // bullet_eta_dev 复用 bullet_dev 的贴图
  this.load.image('bullet_eta_basic_icon', 'pic/load/eta/basic.png');
  // bullet_eta_basic 复用 bullet_basic 的贴图
  this.load.image('bullet_eta_stinger_icon', 'pic/load/eta/stinger.png');
  // bullet_eta_stinger 复用 bullet_stinger 的贴图
  this.load.image('bullet_eta_leaf_icon', 'pic/load/eta/leaf.png');
  // bullet_eta_leaf 复用 bullet_leaf 的贴图
  this.load.image('bullet_eta_rock_icon', 'pic/load/eta/rock.png');
  // bullet_eta_rock 复用 bullet_rock 的贴图
  this.load.image('bullet_eta_soil_icon', 'pic/load/eta/soil.png');
  // bullet_eta_soil 复用 bullet_soil 的贴图
}

function create() {
  const scene = this;
  
  // 🛡️ 修复：保存 scene 引用到全局变量
  window.gameScene = scene;
  
  console.log('🎮 Creating game scene...');
  console.log('📦 Current inventory.bullets:', inventory.bullets);
  console.log('🔢 Current bulletCounts:', inventory.bulletCounts);
  console.log('🎯 Current currentBulletType:', currentBulletType);
  console.log('🎯 Current inventoryVisible:', inventoryVisible);
  
  scene.mobs = scene.physics.add.group();
  
  scene.physics.add.collider(scene.mobs, scene.mobs);

  bullets = scene.physics.add.group({ maxSize: 50 });
  scene.inventoryUI = scene.add.group();
  
  // 🛡️ 创建怪物血条组
  scene.mobHealthBars = scene.add.group();

  // 🛡️ 首先注册 mobSpawned 监听器（用于新怪物）
  socket.on('mobSpawned', mob => {
    console.log(`🆕 New mob spawned: ${mob.type} at (${mob.x}, ${mob.y})`);
    const mobSprite = scene.mobs.create(mob.x, mob.y, mob.type)
      .setScale(0.167).setDepth(5)  // 🛡️ 从 0.25 改为 0.167（约 2/3）
      .setCollideWorldBounds(true);

    mobSprite.mobType = mob.type;
    mobSprite.mobId = mob.id;
    mobSprite.health = mob.health;
    mobSprite.active = true;
    mobSprite.body.moves = false;
    
    // 🛡️ 创建血条
    const maxHealth = mob.type === 'moon' ? 100 : (mob.type === 'green' ? 50 : 150);
    createMobHealthBar(scene, mob.id, mob.x, mob.y, mob.health, maxHealth, mob.type);
  });

  // 🛡️ 然后注册 currentMobs 监听器（用于初始怪物）
  socket.on('currentMobs', mobList => {
    console.log('📦 Received currentMobs:', mobList.length, 'mobs');
    console.log('📋 Mob list:', mobList);
    
    // 🛡️ 清空现有怪物和血条
    if (scene.mobHealthBars) {
      scene.mobHealthBars.clear(true, true);
      console.log('🧹 Cleared all existing health bars');
    }
    
    if (!scene.mobHealthBars) {
      scene.mobHealthBars = scene.add.group();
      console.log('✅ Created mobHealthBars group');
    }
    
    scene.mobs.clear(true, true);
    
    // 🛡️ 逐个创建怪物
    if (mobList && mobList.length > 0) {
      mobList.forEach((mob, index) => {
        console.log(`  [${index}] Creating ${mob.type} (${mob.id}) at (${mob.x}, ${mob.y}) with ${mob.health} HP`);
        
        const mobSprite = scene.mobs.create(mob.x, mob.y, mob.type)
          .setScale(0.167).setDepth(5)  // 🛡️ 从 0.25 改为 0.167（约 2/3）
          .setCollideWorldBounds(true);

        mobSprite.mobType = mob.type;
        mobSprite.mobId = mob.id;
        mobSprite.health = mob.health;
        mobSprite.active = true;
        mobSprite.body.moves = false;
        
        // 🛡️ 创建血条
        const maxHealth = mob.type === 'moon' ? 100 : (mob.type === 'green' ? 50 : 150);
        createMobHealthBar(scene, mob.id, mob.x, mob.y, mob.health, maxHealth, mob.type);
      });
      
      console.log('✅ Created', mobList.length, 'monsters');
      console.log('📊 scene.mobs count:', scene.mobs.getChildren().length);
      console.log('📊 mobHealthBars count:', scene.mobHealthBars.getChildren().length);
    } else {
      console.warn('⚠️ No mobs in currentMobs!');
    }
  });

  socket.on('mobUpdate', updatedMobs => {
    scene.mobs.getChildren().forEach(m => {
      const mobData = updatedMobs[m.mobId];
      if (mobData) {
        m.setPosition(mobData.x, mobData.y);
        if (m.body && mobData.vx !== undefined && mobData.vy !== undefined) {
          m.setVelocity(mobData.vx, mobData.vy);
          m.body.moves = false;
        }
        
        // 🛡️ 更新血条位置
        updateMobHealthBarPosition(scene, m.mobId, m.x, m.y);
      }
    });
  });
  
  // 🛡️ 监听怪物血条更新
  socket.on('mobHealthUpdate', healthData => {
    console.log('📊 Received mobHealthUpdate:', Object.keys(healthData).length, 'mobs');
    
    for (const mobId in healthData) {
      const data = healthData[mobId];
      console.log(`   ${mobId}: ${data.health}/${data.maxHealth} HP (${data.type})`);
      
      // 🛡️ 检查血条是否存在，如果不存在说明是刚刷新的怪物，等待 mobSpawned 事件创建
      const existingBar = scene.mobHealthBars?.getChildren().find(bar => bar.mobId === mobId);
      if (!existingBar) {
        console.debug(`⏳ Health bar not found for ${mobId}, will be created on spawn`);
        continue; // 跳过，等待 mobSpawned 事件创建
      }
      
      updateMobHealthBar(scene, mobId, data.health, data.maxHealth);
    }
  });
  
  socket.on('mobKilled', ({ id }) => {
    console.log('💀 Mob killed:', id);
    // 🛡️ 移除血条
    removeMobHealthBar(scene, id);
    
    scene.mobs.getChildren().forEach(m => {
      if (m.mobId === id) m.destroy();
    });
  });

  // 🛡️ 在 currentMobs 之后立即定义 inventoryToggleBtn（在所有使用之前）
  const inventoryToggleBtn = scene.add.image(config.width - 60, config.height - 60, 'inventoryToggleBtn')
    .setOrigin(0.5)
    .setScale(0.1)
    .setDepth(999)
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true });

  inventoryToggleBtn.on('pointerdown', () => {
    inventoryVisible = !inventoryVisible;
    console.log(`🧭 Inventory toggled — now ${inventoryVisible ? 'SHOW ALL' : 'HIDE ALL'}`);
    
    if (scene.inventoryUI) {
      const children = scene.inventoryUI.getChildren();
      console.log('📊 UI children count:', children.length);
      
      children.forEach((child, idx) => {
        if (child instanceof Phaser.GameObjects.Image) {
          // 🛡️ 处理子弹图标
          if (inventoryVisible) {
            // 🟢 显示所有子弹 - 修复：使用网格布局
            const iconIndex = Math.floor(idx / 2);
            const row = Math.floor(iconIndex / BULLETS_PER_ROW);
            const col = iconIndex % BULLETS_PER_ROW;
            
            child.x = START_X + col * ICON_SPACING_X;
            child.y = START_Y - row * ICON_SPACING_Y;
            child.setAlpha(1);
            child.setInteractive();
          } else {
            // 🔴 隐藏所有子弹
            child.x = -1000;
            child.y = -1000;
            child.setAlpha(0);
          }
        } else if (child instanceof Phaser.GameObjects.Text) {
          // 🛡️ 处理数量文本
          if (inventoryVisible) {
            // 🟢 显示所有文本 - 修复：使用网格布局
            const textIndex = Math.floor((idx - 1) / 2);
            const row = Math.floor(textIndex / BULLETS_PER_ROW);
            const col = textIndex % BULLETS_PER_ROW;
            
            const iconX = START_X + col * ICON_SPACING_X;
            const iconY = START_Y - row * ICON_SPACING_Y;
            
            child.x = iconX + 12;
            child.y = iconY + 12;
            child.setAlpha(1);
          } else {
            // 🔴 隐藏所有文本
            child.x = -1000;
            child.y = -1000;
            child.setAlpha(0);
          }
        }
      });
    } else {
      console.warn('⚠️ scene.inventoryUI does not exist!');
    }
  });

  // 🛡️ 在 create 中立即渲染一次库存（如果已有数据）
  if (inventory.bullets.length > 0) {
    console.log('🎨 Rendering inventory in create (immediate)...');
    renderInventory(scene);
    
    // 🛡️ 强制确保 inventory 可见
    inventoryVisible = true;
    console.log('✅ Set inventoryVisible to true');
    
    // 创建当前装备的子弹图标
    scene.loadoutIcon = scene.add.image(
      config.width / 2,
      config.height - 40,
      bulletConfigs[currentBulletType].icon
    ).setScrollFactor(0).setScale(0.06).setDepth(999).setOrigin(0.5);
  } else {
    console.warn('⚠️ No bullets in inventory yet!');
  }

  socket.on('bulletFired', data => {
    console.log(`📬 Received bulletFired event from ${data.playerId}`);
    
    // 🛡️ 从子弹池中查找或创建子弹
    let bullet = null;
    
    // 🛡️ 修复：eta 子弹使用对应的贴图纸
    const spriteKey = data.bulletType.startsWith('eta_') 
      ? `bullet_${data.bulletType.replace('eta_', '')}`  // eta_basic -> bullet_basic
      : `bullet_${data.bulletType}`;
    
    bullets.children.each(b => {
      if (!b.active && b.texture.key === spriteKey) {
        bullet = b;
        return true; // break the loop
      }
    });
    
    // 🛡️ 如果没有找到非活跃子弹，创建新的
    if (!bullet) {
      console.log(`🆕 Creating new bullet for ${data.bulletType} with sprite ${spriteKey}`);
      bullet = bullets.create(data.x, data.y, spriteKey);
      if (!bullet) {
        console.warn(`⚠️ Failed to create bullet for ${data.bulletType}`);
        return;
      }
      bullet.setDisplaySize(24, 24).body.setSize(24, 24);
    }
    
    bullet.setActive(true).setVisible(true).setDepth(1);
    bullet.setRotation(data.angle).setPosition(data.x, data.y);
    bullet.shooterId = data.playerId;
    bullet.bulletId = data.id; // 🛡️ 保存子弹 ID 用于匹配删除

    scene.physics.velocityFromRotation(data.angle, bulletConfigs[data.bulletType].speed, bullet.body.velocity);

    // 🛡️ 修复：超时时间改为 3 秒作为备用清理机制
    scene.time.delayedCall(3000, () => {
      if (bullet && bullet.active) {
        bullet.setActive(false).setVisible(false).body.stop();
      }
    });
  });

  // 🛡️ 新增：监听子弹命中事件（立即删除子弹）
  socket.on('bulletHit', ({ bulletId, shooterId }) => {
    console.log(`🎯 Received bulletHit event: ${bulletId} from ${shooterId}`);
    
    bullets.children.each(b => {
      if (b.active && b.bulletId === bulletId) {
        console.log(`   🗑️ Deleting bullet ${bulletId}`);
        b.setActive(false).setVisible(false).body.stop();
      }
    });
  });

  socket.on('playerDamaged', ({ id, damage }) => {
    const p = players[id];
    if (p) {
      p.health -= damage;
      console.log(`💔 Player ${id} damaged by ${damage}, health now: ${p.health}`);
    }
  });

  socket.on('playerDied', ({ id }) => {
    const p = players[id];
    if (p) {
      // 🛡️ 修复：设置死亡标记，防止重复处理
      p.dead = true;
      p.setTint(0xff0000).disableBody(true, true);
      p.healthBar.setVisible(false);
      p.healthBarBg.setVisible(false);
      console.log(`💀 Player ${id} died`);
    }
  });

  // 🛡️ 修复：添加击退效果监听并扣血
  socket.on('playerDamagedByMob', ({ id, damage, x, y }) => {
    const p = players[id];
    if (p) {
      // 🛡️ 扣血
      p.health -= damage;
      console.log(`💥 Player ${id} hit by mob: -${damage} HP, health now: ${p.health}`);
      
      // 🛡️ 只更新自己的位置（服务器已经计算好击退后的位置）
      if (id === myID) {
        p.x = x;
        p.y = y;
        console.log(`   📍 Position updated to: (${x}, ${y})`);
      }
    }
  });

  socket.on('playerRespawned', data => {
    console.log(`🔄 Player ${data.id} respawning...`);
    const p = players[data.id];
    if (p) {
      // 🛡️ 修复：确保是同一个玩家对象才启用
      p.enableBody(true, data.x, data.y, true, true);
      p.clearTint();
      p.health = 100;
      p.rotation = data.rotation;
      p.healthBar.setVisible(true);
      p.healthBarBg.setVisible(true);
      p.dead = false;
      console.log(`✅ Player ${data.id} resurrected at (${data.x}, ${data.y})`);
    } else {
      // 🛡️ 如果玩家对象不存在，重新创建
      addPlayer(scene, data, data.id);
    }
  });

  socket.on('playerSpined', data => {
    const p = players[data.id];
    if (p) p.rotation = data.rotation;
  });

  socket.on('currentPlayers', serverPlayers => {
    currentPlayersData = serverPlayers;
    console.log('📬 Received currentPlayers:', serverPlayers);
    
    if (!initialized && myID && serverPlayers[myID]) {
      tryInitialize(scene);
    }
  });

  socket.on('newPlayer', data => {
    console.log('🎉 newPlayer:', data);
    if (!players[data.id]) addPlayer(scene, data, data.id);
  });

  socket.on('playerMoved', data => {
    if (players[data.id]) {
      players[data.id].x = data.x;
      players[data.id].y = data.y;
    }
  });

  socket.on('playerDisconnected', id => {
    console.log(`👋 Disconnected: ${id}`);
    if (players[id]) {
      players[id].destroy();
      delete players[id];
    }
  });

  socket.on('itemDropped', data => {
    const iconKey = bulletConfigs[data.type].icon;
    
    console.log(`🎁 Item dropped: ${data.type} using icon ${iconKey}`);
    
    // 🛡️ 修复：掉落物使用装备图标，并设置固定大小
    const drop = scene.add.image(data.x, data.y, iconKey)
      .setDisplaySize(40, 40)  // 🛡️ 固定为 40x40 像素
      .setDepth(100).setInteractive();

    drop.dropId = data.id;
    drop.dropType = data.type;

    drop.on('pointerdown', () => {
      try {
        // 🛡️ 捡起子弹，增加数量
        if (!inventory.bullets.includes(drop.dropType)) {
          inventory.bullets.push(drop.dropType);
          inventory.bulletCounts[drop.dropType] = 1;
          console.log(`🔓 Unlocked new bullet: ${drop.dropType}`);
        } else {
          inventory.bulletCounts[drop.dropType] = (inventory.bulletCounts[drop.dropType] || 0) + 1;
          console.log(`➕ Increased ${drop.dropType} count to ${inventory.bulletCounts[drop.dropType]}`);
        }
        
        console.log(`📊 Current bullet counts:`, inventory.bulletCounts);
        
        socket.emit('updateBulletsUnlocked', { bulletsUnlocked: inventory.bullets });
        socket.emit('updateBulletCount', { 
          bulletType: drop.dropType, 
          count: inventory.bulletCounts[drop.dropType] 
        });
        
        // 🛡️ 重新渲染库存以更新数量显示（保持当前可见状态）
        if (scene && scene.inventoryUI) {
          renderInventory(scene);
          
          // 🛡️ 如果当前是可见状态，确保所有图标都显示出来
          if (inventoryVisible) {
            const children = scene.inventoryUI.getChildren();
            children.forEach((child, idx) => {
              if (child instanceof Phaser.GameObjects.Image) {
                // 🛡️ 修复：重新计算网格坐标
                const iconIndex = Math.floor(idx / 2);  // 🛡️ 每 2 个对象（图标 + 文字）对应 1 个子弹
                const row = Math.floor(iconIndex / BULLETS_PER_ROW);
                const col = iconIndex % BULLETS_PER_ROW;
                
                child.x = START_X + col * ICON_SPACING_X;
                child.y = START_Y - row * ICON_SPACING_Y;
                child.setAlpha(1);
                child.setInteractive();
              } else if (child instanceof Phaser.GameObjects.Text) {
                const textIndex = Math.floor((idx - 1) / 2);
                const row = Math.floor(textIndex / BULLETS_PER_ROW);
                const col = textIndex % BULLETS_PER_ROW;
                
                const iconX = START_X + col * ICON_SPACING_X;
                const iconY = START_Y - row * ICON_SPACING_Y;
                
                child.x = iconX + 12;
                child.y = iconY + 12;
                child.setAlpha(1);
              }
            });
          }
        }
        
        drop.destroy();
      } catch (error) {
        console.error('❌ Error picking up bullet:', error);
      }
    });
  });

  scene.time.addEvent({
    delay: 200,
    loop: true,
    callback: () => {
      console.log('🧠 Init check – myID:', myID, 'initialized:', initialized);
      if (!initialized && myID && currentPlayersData && currentPlayersData[myID]) {
        tryInitialize(scene);
      }
    }
  });

  scene.time.addEvent({
    delay: 2000,
    loop: true,
    callback: () => {
      bullets.children.each(bullet => {
        if (bullet.active && (
          bullet.y < 0 || bullet.y > 1200 || bullet.x < 0 || bullet.x > 1600
        )) {
          bullet.setActive(false).setVisible(false).body.stop();
        }
      });
    }
  });

  scene.time.delayedCall(4000, () => {
    if (!initialized) {
      console.log('🧯 Retry: emitting readyToInit again...');
      socket.emit('readyToInit');
    }
  });

  scene.input.on('pointerdown', pointer => {
    const uiElements = [inventoryToggleBtn, ...(scene.inventoryUI?.getChildren() || [])];
    const isOnUI = uiElements.some(el => el.input && el.input.enabled && el.getBounds().contains(pointer.x, pointer.y));
    if (!isOnUI && pointer.leftButtonDown() && player) fireBullet(scene, player);
  });

  cursors = scene.input.keyboard.createCursorKeys();
  scene.cameras.main.setBounds(0, 0, 1600, 1200);
  scene.physics.world.setBounds(0, 0, 1600, 1200);

  scene.failsafe = scene.add.rectangle(400, 300, 60, 60, 0x00ff00).setDepth(999);
  // 🛡️ 隐藏 failsafe（绿色方块）
  scene.failsafe.setVisible(false);
  
  const infoText = scene.add.text(10, 570, '', {
    fontSize: '16px',
    fill: '#ffffff'
  }).setScrollFactor(0).setDepth(999);

  function updateStatus(msg) {
    infoText.setText(`🛰️ ${msg}`);
    console.log(msg);
  }

  console.log('🚀 create() called - Ready to receive mobs!');
}

function tryInitialize(scene) {
  if (initialized) return;

  console.log('🎯 tryInitialize() – Spawning players...');
  console.log('📊 currentPlayersData:', currentPlayersData);
  
  for (const id in currentPlayersData) {
    addPlayer(scene, currentPlayersData[id], id);
  }

  initialized = true;
  console.log('✅ Initialization complete');
}

function update() {
  if (!player) return;

  const speed = 200;
  player.setVelocity(0);
  const pointer = game.input.activePointer;
  const angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);
  player.rotation = angle;
  socket.emit('playerSpined', { rotation: player.rotation });

  if (cursors.left.isDown) player.setVelocityX(-speed);
  else if (cursors.right.isDown) player.setVelocityX(speed);

  if (cursors.up.isDown) player.setVelocityY(-speed);
  else if (cursors.down.isDown) player.setVelocityY(speed);

  socket.emit('move', { x: player.x, y: player.y });
  
  // 🛡️ 修复：更新所有玩家血条
  for (const id in players) {
    const p = players[id];
    if (!p || !p.healthBar) continue;

    // 🛡️ 确保血量不会超过最大值或低于 0
    const maxHealth = 100;
    const currentHealth = Math.max(0, Math.min(p.health ?? 0, maxHealth));
    const hpRatio = currentHealth / maxHealth;
    
    // 🛡️ 更新血条位置和宽度
    p.healthBar.setPosition(p.x, p.y - 40);
    p.healthBarBg.setPosition(p.x, p.y - 40);
    p.healthBar.width = 30 * hpRatio;

    // 🛡️ 根据血量百分比改变颜色
    if (hpRatio >= 0.7) {
      p.healthBar.fillColor = 0x00ff00; // 🟢 绿色 (70-100%)
    } else if (hpRatio >= 0.4) {
      p.healthBar.fillColor = 0xffff00; // 🟡 黄色 (40-70%)
    } else {
      p.healthBar.fillColor = 0xff0000; // 🔴 红色 (0-40%)
    }
  }
  
  if (players[myID]) {
    const serverPlayer = players[myID];
    const diff = Math.abs(player.x - serverPlayer.x) + Math.abs(player.y - serverPlayer.y);
    if (diff > 100) {
      player.x = serverPlayer.x;
      player.y = serverPlayer.y;
    }
  }
}

function fireBullet(scene, source) {
  console.log('🔫 fireBullet() called');
  console.log('📦 currentBulletType:', currentBulletType);
  console.log('📋 inventory.bullets:', inventory.bullets);
  console.log('🔢 Current bullet count:', inventory.bulletCounts[currentBulletType]);
  
  const config = bulletConfigs[currentBulletType];

  if (!config || scene._reloading) return;
  
  // 🛡️ 检查是否有子弹（至少要有 1 个才能使用）
  if (inventory.bulletCounts[currentBulletType] <= 0) {
    console.warn(`⚠️ No ${currentBulletType} bullets available!`);
    return;
  }

  console.log('⚙️ Bullet config:', config);

  // 🛡️ 从子弹池中查找或创建子弹 - 修复：正确匹配贴图名称
  let bullet = null;
  
  // 🛡️ 修复：eta 子弹使用对应的 theta 贴图名称
  const spriteKey = currentBulletType.startsWith('eta_')
    ? `bullet_${currentBulletType.replace('eta_', '')}`  // eta_stinger -> bullet_stinger
    : `bullet_${currentBulletType}`;  // basic -> bullet_basic
  
  console.log(`🔍 Looking for bullet with sprite key: ${spriteKey}`);
  
  bullets.children.each(b => {
    if (!b.active && b.texture.key === spriteKey) {
      bullet = b;
      return true; // break the loop
    }
  });
  
  // 🛡️ 如果没有找到非活跃子弹，创建新的
  if (!bullet) {
    console.log(`🆕 Creating new bullet for ${currentBulletType}`);
    // 🛡️ 修复：使用正确的贴图名称
    bullet = bullets.create(source.x, source.y, spriteKey);
    if (!bullet) {
      console.warn(`⚠️ Failed to create bullet for ${currentBulletType}`);
      return;
    }
    bullet.setDisplaySize(24, 24).body.setSize(24, 24);
  }

  bullet.setActive(true).setVisible(true).setDepth(1)
    .setRotation(source.rotation)
    .setPosition(source.x, source.y);

  bullet.shooterId = source.playerId || myID;
  scene.physics.velocityFromRotation(source.rotation, config.speed, bullet.body.velocity);

  socket.emit('fireBullet', {
    x: source.x,
    y: source.y,
    angle: source.rotation,
    bulletType: currentBulletType
  });

  scene._reloading = true;
  scene.time.delayedCall(config.reloadTime, () => {
    scene._reloading = false;
  });
}

function renderInventory(scene) {
  console.log('🎨 renderInventory() called');
  console.log('📦 inventory.bullets:', inventory.bullets);
  console.log('🔢 inventory.bulletCounts:', inventory.bulletCounts);
  console.log('🎯 inventoryVisible:', inventoryVisible);
  console.log('🎯 selectedBulletIndex:', selectedBulletIndex);
  
  if (!scene.inventoryUI) {
    console.log('⚠️ Creating inventoryUI group...');
    scene.inventoryUI = scene.add.group();
  }
  
  scene.inventoryUI.clear(true, false); // 🛡️ 只清空内容，不销毁组
  console.log('🧹 Cleared inventoryUI group');
  
  inventory.bullets.forEach((type, i) => {
    const config = bulletConfigs[type];
    if (!config) {
      console.warn(`⚠️ No config for bullet type: ${type}`);
      return;
    }
    
    const count = inventory.bulletCounts[type] || 0;
    console.log(`➕ Adding bullet icon ${i}: ${type} (count: ${count})`);
    
    // 🛡️ 修复：计算网格坐标（从底部向上排列）
    const row = Math.floor(i / BULLETS_PER_ROW);  // 第几行（从 0 开始）
    const col = i % BULLETS_PER_ROW;              // 第几列（从 0 开始）
    
    // 🛡️ 从底部开始向上排列：row 0 是最底层
    const iconX = START_X + col * ICON_SPACING_X;
    const iconY = START_Y - row * ICON_SPACING_Y;  // 向上递减 Y 坐标
    
    console.log(`   📍 Position: row=${row}, col=${col}, (${iconX}, ${iconY})`);
    
    // 🛡️ 创建子弹图标
    const icon = scene.add.image(iconX, iconY, config.icon)
      .setScrollFactor(0).setScale(0.07).setDepth(998).setOrigin(0.5)
      .setInteractive();

    // 🛡️ 添加数量文本（紧贴图标右下角）
    const countText = scene.add.text(
      iconX + 12,  // 🛡️ 图标右侧 +12 像素
      iconY + 12,  // 🛡️ 图标下方 +12 像素
      `×${count}`,
      {
        fontSize: '12px',
        fill: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      }
    ).setScrollFactor(0).setDepth(999).setOrigin(0, 0); // 🛡️ 左上角对齐
    
    icon.on('pointerdown', () => {
      // 🛡️ 只有当该子弹数量>0 时才能选择
      if (inventory.bulletCounts[type] <= 0) {
        console.warn(`⚠️ Cannot select ${type}, count is 0`);
        return;
      }
      
      selectedBulletIndex = i;
      currentBulletType = inventory.bullets[selectedBulletIndex];
      console.log(`📦 Selected bullet: ${currentBulletType} (count: ${inventory.bulletCounts[currentBulletType]})`);

      scene.inventoryUI.getChildren().forEach(child => {
        if (child instanceof Phaser.GameObjects.Image) {
          child.clearTint();
        }
      });
      icon.setTint(0xffffaa);
      
      if (scene.loadoutIcon) {
        scene.loadoutIcon.setTexture(bulletConfigs[currentBulletType].icon);
      }
      
      socket.emit('playerLoadoutChanged', { bulletType: currentBulletType });
    });

    // 🛡️ 根据 inventoryVisible 状态决定初始位置
    if (!inventoryVisible) {
      // 🔴 隐藏：移到屏幕外
      icon.x = -1000;
      icon.y = -1000;
      icon.setAlpha(0);
      countText.x = -1000;
      countText.y = -1000;
      countText.setAlpha(0);
      console.log(`🔽 Hiding bullet icon ${i} and count text`);
    } else {
      // 🟢 显示：保持原位置
      icon.x = iconX;
      icon.y = iconY;
      icon.setAlpha(1);
      countText.x = iconX + 12;
      countText.y = iconY + 12;
      countText.setAlpha(1);
    }
    
    scene.inventoryUI.add(icon);
    scene.inventoryUI.add(countText);
    console.log(`✅ Added bullet ${i} and count text to inventoryUI`);
  });
  
  const childrenCount = scene.inventoryUI.getChildren().length;
  console.log('✅ Inventory rendered with', inventory.bullets.length, 'bullets');
  console.log('📊 inventoryUI children count:', childrenCount);
}

function addPlayer(scene, data, id) {
  console.log(`👥 addPlayer() for ${id}`, data);
  
  if (players[id]) {
    players[id].destroy();
  }
  
  const p = scene.physics.add.sprite(data.x, data.y, 'player').setCollideWorldBounds(true);
  p.setOrigin(0.5);
  p.playerId = id;
  p.health = data.health ?? 100;

  const healthBarBg = scene.add.rectangle(0, 0, 30, 5, 0x333333).setDepth(998);
  const healthBar = scene.add.rectangle(0, 0, 30, 5, 0x00ff00).setDepth(999);
  p.healthBar = healthBar;
  p.healthBarBg = healthBarBg;
  players[id] = p;

  if (id === myID) {
    player = p;
    scene.cameras.main.startFollow(player, false);
  }
}

// 🛡️ 新增：创建怪物血条
function createMobHealthBar(scene, mobId, x, y, health, maxHealth, type) {
  console.log(`❤️ Creating health bar for ${type} (${mobId}): ${health}/${maxHealth}`);
  
  // 🛡️ 先检查是否已存在
  const existing = scene.mobHealthBars.getChildren().find(bar => bar.mobId === mobId);
  if (existing) {
    console.warn(`⚠️ Health bar already exists for ${mobId}, removing old one`);
    existing.destroy();
  }
  
  // 🛡️ 背景：depth 998
  const healthBarBg = scene.add.rectangle(x, y - 30, 40, 5, 0x333333).setDepth(998);
  healthBarBg.mobId = mobId;
  healthBarBg.isBg = true; // 🛡️ 标记为背景
  
  // 🛡️ 血条：depth 999
  const hpRatio = health / maxHealth;
  const healthBar = scene.add.rectangle(x, y - 30, 40 * hpRatio, 5, 0x00ff00).setDepth(999); // 🛡️ 初始绿色
  healthBar.mobId = mobId;
  healthBar.isBg = false; // 🛡️ 标记为血条
  healthBar.maxHealth = maxHealth;
  healthBar.currentHealth = health;
  
  scene.mobHealthBars.add(healthBar);
  scene.mobHealthBars.add(healthBarBg);
  
  console.log(`✅ Created health bar for ${mobId} (width: ${healthBar.width}, depth: ${healthBar.depth})`);
}

// 🛡️ 更新怪物血条位置
function updateMobHealthBarPosition(scene, mobId, x, y) {
  scene.mobHealthBars.getChildren().forEach(bar => {
    if (bar.mobId === mobId) {
      bar.x = x;
      bar.y = y - 30;
    }
  });
}

// 🛡️ 更新怪物血量
function updateMobHealthBar(scene, mobId, health, maxHealth) {
  const healthBars = scene.mobHealthBars.getChildren();
  console.log(`🔍 Searching for ${mobId} in ${healthBars.length} bars`);
  
  // 🛡️ 使用 isBg 标记来区分血条和背景
  const healthBar = healthBars.find(bar => bar.mobId === mobId && bar.isBg === false);
  const healthBarBg = healthBars.find(bar => bar.mobId === mobId && bar.isBg === true);
  
  if (healthBar && healthBarBg) {
    
    
    const hpRatio = Math.max(health / maxHealth, 0);
    healthBar.width = 40 * hpRatio;
    healthBar.currentHealth = health;
    
    // 🛡️ 根据血量百分比改变颜色（统一逻辑）
    if (hpRatio >= 0.7) {
      healthBar.fillColor = 0x00ff00; // 🟢 绿色 (70-100%)
    } else if (hpRatio >= 0.4) {
      healthBar.fillColor = 0xffff00; // 🟡 黄色 (40-70%)
    } else {
      healthBar.fillColor = 0xff0000; // 🔴 红色 (0-40%)
    }
    
    console.log(`   ✅ Width: ${healthBar.width.toFixed(1)}, Color: ${getColorName(healthBar.fillColor)}`);
  } else {
    console.warn(`⚠️ Health bar not found for ${mobId} (found bg: ${!!healthBarBg}, found bar: ${!!healthBar})`);
  }
}

// 🛡️ 辅助函数：获取颜色名称
function getColorName(color) {
  if (color === 0x00ff00) return 'GREEN';
  if (color === 0xffff00) return 'YELLOW';
  if (color === 0xff0000) return 'RED';
  return `#${color.toString(16)}`;
}

// 🛡️ 移除怪物血条
function removeMobHealthBar(scene, mobId) {
  console.log('🗑️ Removing health bar for:', mobId);
  const barsToRemove = scene.mobHealthBars.getChildren().filter(bar => bar.mobId === mobId);
  barsToRemove.forEach(bar => {
    bar.destroy();
  });
  console.log(`✅ Removed ${barsToRemove.length} bars for ${mobId}`);
}

