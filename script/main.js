var gamejs = require('gamejs');
var box2d = require('./Box2dWeb-2.1.a.3');
var object = require('object');
var global = require('global');
var level = require('level');

//------------------------------------------------------------------------------
// preload everything, call main when done
var data = [
    
    "../data/block00.png",
    "../data/block01.png",
    "../data/block02.png",
    "../data/block03.png",
    "../data/knight00.png",
    "../data/knight01.png",
    "../data/princess.png",
    "../data/princess.png",
    "../data/floor.png",
];
gamejs.preload(data);
gamejs.ready(main);

//------------------------------------------------------------------------------
// game state
var STATE_BUILDING = 0;
var STATE_DEFENDING = 1;
var STATE_LOST = 2;
var STATE_WIN = 3;
var gState = STATE_BUILDING;
var gDefendingTimer = 0.0;
var gDefendingNextSpawn = 0.0;
var gDefendingNextLeft = true;

//------------------------------------------------------------------------------
// gameplay elements
var NUM_BLOCK_KINDS = 4;
var gBlockStore = null;
var gBlockSet = null;
var gBlockPickup = null;
var gFloor = null;
var gKnightSet = null;
var gLevelIndex = 0;

//------------------------------------------------------------------------------
// Box2D stuff
var b2World = null;
var b2Draw = false;

//------------------------------------------------------------------------------
// UI stuff
var gFont = null;

//------------------------------------------------------------------------------
// entry point
function main() {

    init();
    gamejs.time.fpsCallback(update, this, 24);
}

//------------------------------------------------------------------------------
// create everything
function init() {

    // set display size
    gamejs.display.setMode([1024, 768]);
    
    // create Box2D world
    b2World = new box2d.b2World(
       new box2d.b2Vec2(0, 10),  // gravity
       true                      // allow sleep
    );

    // add our contact listener
    // http://stackoverflow.com/questions/10878750/box2dweb-collision-contact-point
    var b2Listener = box2d.Box2D.Dynamics.b2ContactListener;
	var listener = new b2Listener;
    listener.BeginContact = function(contact) {
        //console.log(contact.GetFixtureA().GetBody().GetUserData());
    }
    listener.EndContact = function(contact) {
        // console.log(contact.GetFixtureA().GetBody().GetUserData());
    }
    listener.PostSolve = function(contact, impulse) {
		var objectA = contact.GetFixtureA().GetBody().GetUserData();
		var objectB = contact.GetFixtureB().GetBody().GetUserData();
        if ((objectA.kind == "knight" && objectB.kind == "princess") || (objectA.kind == "princess" && objectB.kind == "knight")) {
			if (gState == STATE_DEFENDING) {
				gState = STATE_LOST;
			}
		} else if (objectA.kind == "knight" && objectB.kind == "block") {
			objectA.hit = true;
		} else if (objectA.kind == "block" && objectB.kind == "knight") {
			objectB.hit = true;
		}
    }
    listener.PreSolve = function(contact, oldManifold) {
        // PreSolve
    }
    b2World.SetContactListener(listener);
	
    // setup debug draw
    var debugDraw = new box2d.b2DebugDraw();
    debugDraw.SetSprite(document.getElementById("gjs-canvas").getContext("2d"));
    debugDraw.SetDrawScale(global.BOX2D_SCALE);
    debugDraw.SetFillAlpha(0.3);
    debugDraw.SetLineThickness(1.0);
    debugDraw.SetFlags(box2d.b2DebugDraw.e_shapeBit | box2d.b2DebugDraw.e_jointBit);
    b2World.SetDebugDraw(debugDraw);

    // create block store
    gBlockStore = new gamejs.sprite.Group();
    gBlockStore.add(new object.block([32, 32], "princess"));
    for (var i=0; i<NUM_BLOCK_KINDS; i++) {
        gBlockStore.add(new object.block([128 + i*64, 32], i));
    }
    
    // create empty block & knight sets
    gBlockSet = new gamejs.sprite.Group();
    gKnightSet = new gamejs.sprite.Group();
    
    // create floor
    gFloor = new object.floor([0, 640], b2World);

	// create UI
	gFont = new gamejs.font.Font()
}
    
//------------------------------------------------------------------------------
// gather input then draw
function update(dt) {
    
    var events = gamejs.event.get();
    debugInput(events);
    
    // update game state
    switch (gState)
    {
        case STATE_BUILDING: updateBuilding(events, dt); break;
        case STATE_DEFENDING: updateDefending(events, dt); break;
    }
    
    // update physics
    b2World.Step(
        1 / 24,  //frame-rate
        10,      //velocity iterations
        10       //position iterations
    );
    b2World.ClearForces();

    // update gameplay elements
    gBlockSet.forEach(function(block) {
        block.update(dt);
    });
    gKnightSet.forEach(function(knight) {
        knight.update(dt);
		if (knight.hit) {
			knight.die(b2World);
			gKnightSet.remove(knight);
		}
    });

    draw();    
}

//------------------------------------------------------------------------------
// debug keys
function debugInput(events) {
    
    events.forEach(function(event) {
        if (event.type === gamejs.event.KEY_DOWN) {
            if (event.key === gamejs.event.K_b) {
                b2Draw = true;
            };
        } else if (event.type === gamejs.event.KEY_UP) {
            if (event.key === gamejs.event.K_b) {
                b2Draw = false;
            };
        }
    });
}

//------------------------------------------------------------------------------
// building state
function updateBuilding(events, dt) {
    
    events.forEach(function(event) {
        if (event.type === gamejs.event.MOUSE_DOWN) {
            gBlockStore.forEach(function(block) {
                if (block.rect.collidePoint(event.pos)) {
                    if (block.index == "princess") {
                        gBlockStore.remove(block);
                        gBlockPickup = block;
                    }
                    else
                    {
                        gBlockPickup = new object.block(block.rect.topleft, block.index);
                    }
                }
            });
        } else if (event.type === gamejs.event.MOUSE_UP) {
            if (gBlockPickup) {
                gBlockPickup.turnOnPhysics(b2World);
                gBlockSet.add(gBlockPickup);
                if (gBlockPickup.index == "princess") {
                    // switch to defending state!
                    gState = STATE_DEFENDING;
                    gDefendingTimer = 0.0;
                    gDefendingNextSpawn = 2000.0;
                    gDefendingNextLeft = true;
                    console.log("defending");
                }
                gBlockPickup = null;
            }
        } else if (event.type === gamejs.event.MOUSE_MOTION) {
            if (gBlockPickup) {
                gBlockPickup.rect.center = event.pos;
            }
        }
    });
}

//------------------------------------------------------------------------------
// defending state
function updateDefending(events, dt) {

    if (gDefendingTimer > gDefendingNextSpawn) {
        
        if (gDefendingNextLeft) {
            gKnightSet.add(new object.knight([0, 500], 0, b2World, gDefendingNextLeft));
        } else {
            gKnightSet.add(new object.knight([1024-32, 500], 1, b2World, gDefendingNextLeft));
        }                
        
        gDefendingNextSpawn += 2000.0;
        gDefendingNextLeft = !gDefendingNextLeft;
    }
    
	var duration = level.constants[gLevelIndex].duration;
	var timeLeft = (duration - gDefendingTimer) / 1000;
	if (timeLeft >= 0) {
		gDefendingTimer += dt;
	} else {
		gState = STATE_WIN;
	}
}

//------------------------------------------------------------------------------
// draw
function draw() {
    
    gamejs.display.getSurface().fill('white');
    
    var mainSurface = gamejs.display.getSurface();
    gBlockStore.draw(mainSurface);
    gBlockSet.draw(mainSurface);
    gKnightSet.draw(mainSurface);
    if (gBlockPickup) {
        gBlockPickup.draw(mainSurface);
    }
    gFloor.draw(mainSurface);

    if (b2Draw) {
        b2World.DrawDebugData();
    }
	
    // draw game state UI
    switch (gState)
    {
        case STATE_BUILDING: drawBuilding(mainSurface); break;
        case STATE_DEFENDING: drawDefending(mainSurface); break;
        case STATE_LOST: drawLost(mainSurface); break;
        case STATE_WIN: drawWin(mainSurface); break;
    }
}

//------------------------------------------------------------------------------
// draw defending
function drawBuilding(surface) {
	
	surface.blit(gFont.render("BUILDING"), [10,10]);
}

//------------------------------------------------------------------------------
// draw defending
function drawDefending(surface) {
	
	var duration = level.constants[gLevelIndex].duration;
	var timeLeft = (duration - gDefendingTimer) / 1000;
	surface.blit(gFont.render("DEFENDING " + timeLeft), [10,10]);
}

//------------------------------------------------------------------------------
// draw lost
function drawLost(surface) {
	
	surface.blit(gFont.render("LOST"), [10,10]);
}

//------------------------------------------------------------------------------
// draw win
function drawWin(surface) {
	
	surface.blit(gFont.render("WIN"), [10,10]);
}
