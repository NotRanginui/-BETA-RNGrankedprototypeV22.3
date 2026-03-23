const ranks = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Emerald", "Nightmare"];

const BOT_LUCK_CONFIG = {
    "Bronze": [1.5, 3.0],
    "Silver": [3.5, 5.5],
    "Gold": [6.0, 9.0],
    "Platinum": [10.0, 15.0],
    "Diamond": [18.0, 25.0],
    "Emerald": [30.0, 50.0],
    "Nightmare": [75.0, 250.0] 
};

// --- DATA INITIALIZATION ---
let allAccounts = JSON.parse(localStorage.getItem('crimson_accounts')) || [{name: "Player 1", points: 0, streak: 0, history: [], pb: 0}];
let currentAccIdx = parseInt(localStorage.getItem('crimson_current_acc')) || 0;
let globalHighRolls = JSON.parse(localStorage.getItem('crimson_high_rolls')) || [];
let settings = JSON.parse(localStorage.getItem('crimson_settings')) || { roundNumbers: false };

if (!allAccounts[currentAccIdx]) currentAccIdx = 0;

let lastRankIdx = null;
let godMode = false;
let botRigged = false;
let playerLuck = 2.0;
let adminRPBonus = 1.0; // New Admin Var
let botLuckOverride = null; // New Admin Var
let currentBotLuckValue = 1.0; 
let playerSets = 0, botSets = 0, playerRetries = 5, playerRoll = 0, botRoll = 0, isProcessing = false;
let currentBotRank = "Bronze";

// --- UTILITIES ---
function getTime() { return new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}); }
function generateRarity(luckFactor) {
    let base = 1 / Math.pow(Math.random(), 1.2);
    let final = base * luckFactor;
    return parseFloat(Math.max(1, final).toFixed(2));
}
function formatRoll(num) { return settings.roundNumbers ? Math.round(num) : num.toFixed(2); }

// CSS Injection for Streaks & PB
if (!document.getElementById('dynamic-styles')) {
    const style = document.createElement('style');
    style.id = 'dynamic-styles';
    style.innerHTML = `
        @keyframes flashBW { 0% { background: #000; color: #fff; } 50% { background: #fff; color: #000; } 100% { background: #000; color: #fff; } }
        .streak-flashing { animation: flashBW 0.2s infinite; border: 1px solid #fff; }
        @keyframes pbBounce { 0% { transform: scale(1); } 50% { transform: scale(1.3); color: #fbbf24; } 100% { transform: scale(1); } }
        .pb-anim { animation: pbBounce 0.6s ease-in-out; }
    `;
    document.head.appendChild(style);
}

// --- UI CORE ---
function showPointPopup(amount, isWin, label = "") {
    const popup = document.createElement('div');
    popup.innerText = label || ((isWin ? "+" : "-") + Math.abs(Math.round(amount)) + " RP");
    popup.style.cssText = `position:fixed; left:50%; top:45%; transform:translateX(-50%); color:${isWin ? '#22c55e' : '#ef4444'}; font-weight:bold; font-size:1.8rem; pointer-events:none; animation:floatUp 2s ease-out forwards; z-index:9999; text-shadow:0 0 15px rgba(0,0,0,0.8);`;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 2000);
}

function updateUI() {
    let acc = allAccounts[currentAccIdx];
    let rIdx = Math.min(6, Math.floor(acc.points / 400));
    let rankName = ranks[rIdx];
    let pointsInRank = acc.points % 400;
    let division = Math.floor(pointsInRank / 100) + 1;

    let winsInHistory = (acc.history || []).filter(h => h.res === "WIN").length;
    let winRate = acc.history && acc.history.length > 0 ? (winsInHistory / acc.history.length) : 0.5;
    
    const bonusEl = document.getElementById('bonus-display');
    let displayBonus = (winRate - 0.5) * 500; 

    if (winRate >= 0.5) {
        bonusEl.innerText = displayBonus > 0 ? `+${displayBonus.toFixed(0)}% RP BONUS` : `NEUTRAL RP RATE`;
        bonusEl.style.color = displayBonus > 0 ? "#22c55e" : "#9ca3af";
    } else {
        bonusEl.innerText = `${displayBonus.toFixed(0)}% RP PENALTY`;
        bonusEl.style.color = "#ef4444";
    }

    if (lastRankIdx !== null && rIdx > lastRankIdx) playRankUpCutscene(rankName, rIdx);
    lastRankIdx = rIdx;

    document.getElementById('rank-name').innerText = `${rankName.toUpperCase()} ${division}`;
    document.getElementById('user-display-name').innerText = acc.name;
    document.getElementById('rank-points').innerText = Math.floor(acc.points);
    
    // Streak logic
    const sCount = document.getElementById('streak-count');
    sCount.innerText = acc.streak;
    sCount.className = (acc.streak >= 100) ? "streak-flashing" : "";
    sCount.style.color = (acc.streak >= 50) ? "#a855f7" : (acc.streak >= 20) ? "#ef4444" : (acc.streak >= 5) ? "#3b82f6" : "#fff";

    document.getElementById('exp-progress').style.width = (pointsInRank % 100) + "%";
    document.getElementById('current-rank-logo').className = `rank-icon rank-${rankName}`;
    
    localStorage.setItem('crimson_accounts', JSON.stringify(allAccounts));
    localStorage.setItem('crimson_current_acc', currentAccIdx);
}

function playRankUpCutscene(rankName, rankIdx) {
    const overlay = document.getElementById('rank-up-overlay');
    if (!overlay) return;
    document.getElementById('rank-up-name').innerText = rankName.toUpperCase();
    document.getElementById('rank-up-icon').className = `rank-icon rank-${rankName}`;
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('active'), 10);
    setTimeout(() => { overlay.classList.remove('active'); setTimeout(() => overlay.style.display = 'none', 500); }, 3000);
}

function queueBot() {
    let acc = allAccounts[currentAccIdx];
    let pIdx = Math.min(6, Math.floor(acc.points / 400));
    let bIdx = Math.random() < 0.7 ? pIdx : (Math.random() < 0.5 ? Math.min(6, pIdx + 1) : Math.max(0, pIdx - 1));
    currentBotRank = ranks[bIdx];
    document.getElementById('bot-display-name').innerText = `BOT (${currentBotRank.toUpperCase()})`;
}

function resetRound() {
    playerRoll = 0; playerRetries = godMode ? 999 : 5; isProcessing = false;
    document.getElementById('player-roll').innerHTML = `<span class="roll-value">?</span>`;
    document.getElementById('bot-roll').innerHTML = `<span class="roll-value">?</span>`;
    document.getElementById('player-retries').innerText = godMode ? "GOD MODE" : `RETRIES: ${playerRetries}`;
    
    // NEW: Bot Luck Logic
    if (botLuckOverride !== null) {
        currentBotLuckValue = botLuckOverride;
        botLuckOverride = null; // Use only once per round
    } else {
        const range = BOT_LUCK_CONFIG[currentBotRank];
        currentBotLuckValue = botRigged ? 1.05 : range[0] + (Math.pow(Math.random(), 0.2) * (range[1] - range[0]));
    }
    botRoll = generateRarity(currentBotLuckValue);
}

// GAMEPLAY BUTTONS
document.getElementById('roll-btn').onclick = () => {
    if ((playerRetries > 0 || godMode) && !isProcessing) {
        localStorage.setItem('crimson_in_match', 'true'); 
        playerRoll = generateRarity(playerLuck);
        if(!godMode) playerRetries--;
        document.getElementById('player-roll').innerHTML = `<span class="roll-value">1 in ${formatRoll(playerRoll)}</span><span class="roll-suffix">RARITY</span>`;
        document.getElementById('player-retries').innerText = godMode ? "GOD MODE" : `RETRIES: ${playerRetries}`;
        
        if (playerRoll > allAccounts[currentAccIdx].pb) {
            allAccounts[currentAccIdx].pb = playerRoll;
            document.getElementById('player-roll').classList.add('pb-anim');
            showPointPopup(0, true, "NEW PERSONAL BEST!");
            setTimeout(() => document.getElementById('player-roll').classList.remove('pb-anim'), 800);
        }
    }
};

document.getElementById('stand-btn').onclick = () => {
    if (playerRoll === 0 || isProcessing) return;
    isProcessing = true;
    document.getElementById('bot-roll').innerHTML = `<span class="roll-value">1 in ${formatRoll(botRoll)}</span><span class="roll-suffix">RARITY</span>`;
    if (playerRoll > 50) {
        globalHighRolls.push({name: allAccounts[currentAccIdx].name, roll: playerRoll, time: getTime()});
        globalHighRolls.sort((a,b) => b.roll - a.roll).splice(15);
        localStorage.setItem('crimson_high_rolls', JSON.stringify(globalHighRolls));
    }
    setTimeout(() => {
        if (playerRoll > botRoll) playerSets++; else botSets++;
        updateDots();
        if (playerSets === 3 || botSets === 3) handleMatchEnd();
        else setTimeout(resetRound, 1000);
    }, 800);
};

function handleMatchEnd() {
    localStorage.setItem('crimson_in_match', 'false'); 
    let acc = allAccounts[currentAccIdx];
    let win = playerSets === 3;
    let score = `${playerSets}-${botSets}`;
    
    let pRankIdx = Math.min(6, Math.floor(acc.points / 400));
    let expectedLuckRange = BOT_LUCK_CONFIG[ranks[pRankIdx]];
    let pDiv = Math.floor((acc.points % 400) / 100); 
    let expectedLuck = expectedLuckRange[0] + (pDiv * ((expectedLuckRange[1] - expectedLuckRange[0]) / 3));

    let luckDiff = currentBotLuckValue - expectedLuck;
    let luckMultiplier = Math.max(0.4, Math.min(2.5, 1 - (luckDiff / (expectedLuck * 2))));
    let setMultiplier = (score === "3-0" || score === "0-3") ? 1.3 : (score === "3-2" || score === "2-3" ? 0.7 : 1.0);

    let winsInHistory = (acc.history || []).filter(h => h.res === "WIN").length;
    let winRate = acc.history && acc.history.length > 0 ? winsInHistory / acc.history.length : 0.5;
    let winRateMod = (winRate - 0.5) * 5; 

    let pointChange = 0;
    if (win) {
        // Apply Admin RP Bonus here
        pointChange = (15 * (1 + winRateMod)) * luckMultiplier * setMultiplier * adminRPBonus;
        acc.points += pointChange; acc.streak++;
    } else {
        pointChange = ((15 + (pRankIdx * 2)) * (1 - winRateMod)) * luckMultiplier * setMultiplier;
        acc.points = Math.max(0, acc.points - pointChange); acc.streak = 0;
    }
    
    if(!acc.history) acc.history = [];
    acc.history.unshift({res: win ? "WIN" : "LOSS", p: playerRoll, b: botRoll, score: score, diff: pointChange, time: getTime()});
    if(acc.history.length > 20) acc.history.pop(); 

    showPointPopup(pointChange, win);
    playerSets = 0; botSets = 0;
    updateUI(); updateDots(); queueBot(); setTimeout(resetRound, 1500);
}

function updateDots() {
    const p = document.getElementById('player-sets'), b = document.getElementById('bot-sets');
    p.innerHTML = ""; b.innerHTML = "";
    for(let i=0; i<3; i++){
        p.innerHTML += `<div class="dot ${i < playerSets ? 'p-win' : ''}"></div>`;
        b.innerHTML += `<div class="dot ${i < botSets ? 'b-win' : ''}"></div>`;
    }
}

// --- GLOBAL EXPORTS ---
window.toggleModal = function(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = (m.style.display === 'none' || !m.style.display) ? 'flex' : 'none';
    if(id === 'acc-modal' && m.style.display === 'flex') renderAccounts();
};

window.openHistory = function() {
    window.toggleModal('history-modal');
    document.getElementById('history-list').innerHTML = (allAccounts[currentAccIdx].history || []).map(h => `
        <div class="history-item">
            <div style="display:flex; justify-content:space-between; width:100%;">
                <b style="color:${h.res==='WIN'?'#22c55e':'#ef4444'}">${h.res} (${h.score})</b>
                <span style="color:${h.res==='WIN'?'#22c55e':'#ef4444'}">${h.res==='WIN'?'+':'-'}${Math.round(h.diff)} RP</span>
            </div>
            <div class="history-meta"><span>1 in ${formatRoll(h.p)} vs ${formatRoll(h.b)}</span> | <span>${h.time}</span></div>
        </div>`).join('');
};

window.openHighRolls = function() {
    window.toggleModal('high-rolls-modal');
    document.getElementById('high-rolls-list').innerHTML = globalHighRolls.map((h, i) => `<div class="history-item"><span>#${i+1} ${h.name}</span> <b style="color:#ef4444">1 in ${formatRoll(h.roll)}</b></div>`).join('');
};

window.openLeaderboard = function() {
    window.toggleModal('leaderboard-modal');
    document.getElementById('leaderboard-list').innerHTML = [...allAccounts].sort((a,b)=>b.points-a.points).map((acc, i) => `<div class="leader-item"><span>#${i+1} ${acc.name}</span><b>${Math.floor(acc.points)} RP</b></div>`).join('');
}

window.adminAction = function(type) {
    if(type === 'instaWin') { playerSets = 3; handleMatchEnd(); }
    else if(type === 'godMode') { godMode = !godMode; document.getElementById('god-mode-btn').innerText = `GOD MODE: ${godMode?'ON':'OFF'}`; resetRound(); }
    else if(type === 'rigBot') { botRigged = !botRigged; document.getElementById('rig-bot-btn').innerText = `RIG BOT: ${botRigged?'ON':'OFF'}`; }
    else if(type === 'clearHistory') { allAccounts[currentAccIdx].history = []; updateUI(); }
};

window.applyAdminChanges = function() {
    // Player Luck
    playerLuck = parseFloat(document.getElementById('admin-luck-input').value) || 2.0;
    
    // Bot Luck (Round Only)
    let bLuck = document.getElementById('admin-bot-luck-input').value;
    if(bLuck !== "") {
        botLuckOverride = parseFloat(bLuck);
        document.getElementById('admin-bot-luck-input').value = ""; // Clear for next round
    }

    // RP Points
    let rp = document.getElementById('admin-rp-input').value;
    if(rp !== "") allAccounts[currentAccIdx].points = parseInt(rp);

    // RP Bonus Multiplier
    adminRPBonus = parseFloat(document.getElementById('admin-rp-bonus-input').value) || 1.0;

    // Win Streak
    let streakVal = document.getElementById('admin-streak-input').value;
    if(streakVal !== "") allAccounts[currentAccIdx].streak = parseInt(streakVal);

    updateUI(); 
    window.toggleModal('admin-modal');
};

window.switchAcc = function(i) { currentAccIdx = i; updateUI(); queueBot(); resetRound(); window.toggleModal('acc-modal'); };
window.createNewAccount = function() {
    let n = document.getElementById('new-acc-name').value;
    if(n) { allAccounts.push({name: n, points: 0, streak: 0, history: [], pb: 0}); renderAccounts(); document.getElementById('new-acc-name').value = ""; }
};
window.deleteAcc = function(e, i) {
    e.stopPropagation();
    if(allAccounts.length > 1) { allAccounts.splice(i, 1); if(currentAccIdx >= allAccounts.length) currentAccIdx=0; renderAccounts(); updateUI(); }
};
window.updateSettings = function() { settings.roundNumbers = document.getElementById('round-toggle').checked; updateUI(); };
window.wipeData = function() { if(confirm("Wipe all data?")) { localStorage.clear(); location.reload(); } };

function renderAccounts() {
    document.getElementById('acc-list').innerHTML = allAccounts.map((acc, idx) => `<div class="acc-item" style="border-left: 3px solid ${idx === currentAccIdx ? '#ef4444' : 'transparent'}"><div onclick="switchAcc(${idx})" style="flex:1; cursor:pointer;"><b>${acc.name}</b><br><small>${Math.floor(acc.points)} RP</small></div><button onclick="deleteAcc(event, ${idx})">DEL</button></div>`).join('');
}

window.onkeydown = (e) => { if(e.key.toLowerCase() === 'p') { if(prompt("Passcode:") === "admin123") window.toggleModal('admin-modal'); } };
window.onload = () => { updateUI(); queueBot(); resetRound(); };