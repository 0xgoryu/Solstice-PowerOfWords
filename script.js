// UI logic only. All data persistence goes through firebase.js.

import { hasUserSubmitted, submitTake, subscribeToTakes, MAX_ITEMS } from "./firebase.js";

const ROW_COUNT = 5;
const DIRECTIONS = ["right", "left", "right", "left", "right"];

let state = {
  connected: false,
  username: null,
  pfpDataUrl: null,
  hasPosted: false,
  items: [] // {username, pfp, text}
};

const pfpButton = document.getElementById("pfpButton");
const pfpInput = document.getElementById("pfpInput");
const usernameInput = document.getElementById("usernameInput");
const connectBtn = document.getElementById("connectBtn");
const textInput = document.getElementById("textInput");
const submitBtn = document.getElementById("submitBtn");
const charCount = document.getElementById("charCount");
const statusLine = document.getElementById("statusLine");
const feedPanel = document.getElementById("feedPanel");

function sanitizeUsername(raw){
  return raw.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 15);
}

pfpButton.addEventListener("click", ()=>{
  if(state.connected) return;
  pfpInput.click();
});

const PFP_MAX_DIMENSION = 64; // px — small avatar, keeps the encoded size tiny
const PFP_JPEG_QUALITY = 0.7;

function resizeAndCompressImage(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(new Error("Could not read file"));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error("Could not load image"));
      img.onload = ()=>{
        // scale down so the longest side is PFP_MAX_DIMENSION, preserving aspect ratio
        const scale = PFP_MAX_DIMENSION / Math.max(img.width, img.height);
        const w = Math.max(1, Math.round(img.width * Math.min(1, scale)));
        const h = Math.max(1, Math.round(img.height * Math.min(1, scale)));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        resolve(canvas.toDataURL("image/jpeg", PFP_JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

pfpInput.addEventListener("change", async (e)=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;

  try{
    const compressedDataUrl = await resizeAndCompressImage(file);
    state.pfpDataUrl = compressedDataUrl;
    pfpButton.innerHTML = '<img src="' + compressedDataUrl + '" alt="">';
    pfpButton.classList.add("has-image");
  }catch(err){
    console.error("Could not process image:", err);
    statusLine.textContent = "Couldn't use that image. Try a different photo.";
  }
});

usernameInput.addEventListener("input", ()=>{
  const clean = sanitizeUsername(usernameInput.value);
  if(clean !== usernameInput.value) usernameInput.value = clean;
  connectBtn.disabled = clean.length === 0 || state.connected;
});

connectBtn.addEventListener("click", async ()=>{
  if(state.connected) return;
  const clean = sanitizeUsername(usernameInput.value);
  if(!clean) return;

  connectBtn.disabled = true;
  connectBtn.textContent = "Checking…";

  let alreadyPosted = false;
  try{
    alreadyPosted = await hasUserSubmitted(clean);
  }catch(err){
    console.error("Could not check username:", err);
    statusLine.textContent = "Couldn't reach the server. Try again.";
    connectBtn.disabled = false;
    connectBtn.textContent = "Submit";
    return;
  }

  state.connected = true;
  state.username = clean;
  state.hasPosted = alreadyPosted;
  usernameInput.disabled = true;
  pfpButton.disabled = true;
  connectBtn.textContent = "@" + clean;
  connectBtn.classList.add("connected");
  connectBtn.disabled = true;
  updateComposerState();
});

function updateComposerState(){
  if(!state.connected){
    textInput.disabled = true;
    textInput.placeholder = "Tell us who you are to share your take…";
    submitBtn.disabled = true;
    statusLine.textContent = "";
    return;
  }
  if(state.hasPosted){
    textInput.disabled = true;
    textInput.value = "";
    textInput.placeholder = "You already posted your take";
    submitBtn.disabled = true;
    statusLine.textContent = "You've already shared your take as @" + state.username + ".";
    return;
  }
  if(state.items.length >= MAX_ITEMS){
    textInput.disabled = true;
    textInput.placeholder = "Feed is full — 200 takes reached";
    submitBtn.disabled = true;
    statusLine.textContent = "The feed has reached its 200 take limit.";
    return;
  }
  textInput.disabled = false;
  textInput.placeholder = "Share your take on Solstice…";
  submitBtn.disabled = textInput.value.trim().length === 0;
  statusLine.textContent = "";
}

textInput.addEventListener("input", ()=>{
  const len = textInput.value.length;
  charCount.textContent = len + " / 200";
  submitBtn.disabled = !state.connected || state.hasPosted || textInput.value.trim().length === 0;
});

submitBtn.addEventListener("click", async ()=>{
  const val = textInput.value.trim();
  if(!val || !state.connected || state.hasPosted) return;
  if(state.items.length >= MAX_ITEMS){
    updateComposerState();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Posting…";

  try{
    // re-check right before writing to close the race window between
    // connect and submit (in case the same username posted elsewhere meanwhile)
    const alreadyPosted = await hasUserSubmitted(state.username);
    if(alreadyPosted){
      state.hasPosted = true;
      updateComposerState();
      return;
    }
    await submitTake(state.username, val, state.pfpDataUrl);
    state.hasPosted = true;
    updateComposerState();
  }catch(err){
    console.error("Could not submit take:", err);
    statusLine.textContent = "Couldn't post your take. Try again.";
    submitBtn.disabled = false;
  }finally{
    submitBtn.textContent = "Post take";
  }
});

function buildChip(item){
  const span = document.createElement("span");
  span.className = "chip";
  if(item.pfp){
    const img = document.createElement("img");
    img.src = item.pfp;
    img.className = "chip-pfp";
    span.appendChild(img);
  }
  const handle = document.createElement("span");
  handle.className = "handle";
  handle.textContent = "@" + item.username;
  span.appendChild(handle);
  span.appendChild(document.createTextNode(item.text));
  return span;
}

function distributeIntoRows(items){
  const rows = Array.from({ length: ROW_COUNT }, ()=>[]);
  items.forEach((item, i)=>{
    rows[i % ROW_COUNT].push(item);
  });
  return rows;
}

function renderFeed(){
  feedPanel.innerHTML = "";
  if(state.items.length === 0){
    const empty = document.createElement("div");
    empty.className = "feed-empty";
    empty.textContent = "No takes yet. Be the first.";
    feedPanel.appendChild(empty);
    return;
  }

  const rows = distributeIntoRows(state.items);

  rows.forEach((rowItems, idx)=>{
    if(rowItems.length === 0) return;
    const rowEl = document.createElement("div");
    rowEl.className = "marquee-row";

    const dir = DIRECTIONS[idx];
    // repeat content enough times to comfortably overflow the row
    let base = rowItems.slice();
    while(base.length < 6){
      base = base.concat(rowItems);
    }

    const track = document.createElement("div");
    track.className = "marquee-track " + dir;

    // two identical sets back to back: translateX(-50%) loops seamlessly
    for(let s = 0; s < 2; s++){
      const setEl = document.createElement("div");
      setEl.className = "marquee-set";
      base.forEach(item=>{
        setEl.appendChild(buildChip(item));
      });
      track.appendChild(setEl);
    }

    rowEl.appendChild(track);
    feedPanel.appendChild(rowEl);
  });
}

// Live feed: re-renders automatically whenever Firestore data changes.
subscribeToTakes((items)=>{
  state.items = items;
  renderFeed();
  updateComposerState();
});

updateComposerState();
