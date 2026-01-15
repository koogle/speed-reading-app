// Lucide icons as SVG strings
const icons = {
  play: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>',
  pause: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"></rect><rect x="6" y="4" width="4" height="16" rx="1"></rect></svg>',
  skipBack: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" x2="5" y1="19" y2="5"></line></svg>',
  skipForward: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" x2="19" y1="5" y2="19"></line></svg>',
  rewind: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>',
  fastForward: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>',
  x: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
  rotateCcw: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>'
};

class SpeedReader {
  constructor() {
    this.overlay = null;
    this.words = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.wpm = 300;
    this.intervalId = null;
    this.init();
  }

  init() {
    this.loadSettings();
    this.createOverlay();
    this.setupEventListeners();
  }

  loadSettings() {
    chrome.storage.sync.get(['wpm'], (result) => {
      if (result.wpm) {
        this.wpm = result.wpm;
        if (this.wpmSlider) {
          this.wpmSlider.value = this.wpm;
          this.updateWpmDisplay();
        }
      }
    });
  }

  saveSettings() {
    chrome.storage.sync.set({ wpm: this.wpm });
  }

  // Calculate Optimal Recognition Point (ORP)
  // ORP is typically at about 1/3 into the word, slightly left of center
  calculateORP(word) {
    const len = word.length;
    if (len <= 1) return 0;
    if (len <= 3) return 1;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return Math.floor(len * 0.3);
  }

  // Render word with ORP highlighting
  renderWord(word) {
    if (!word) return '';

    const orpIndex = this.calculateORP(word);
    const before = word.substring(0, orpIndex);
    const orp = word.charAt(orpIndex);
    const after = word.substring(orpIndex + 1);

    return `<span class="before-orp">${before}</span><span class="orp">${orp}</span><span class="after-orp">${after}</span>`;
  }

  // Calculate delay for current word (longer pause for punctuation)
  getWordDelay(word) {
    const baseDelay = 60000 / this.wpm;

    // Add extra pause for punctuation
    if (/[.!?]$/.test(word)) {
      return baseDelay * 2.5; // Longer pause at end of sentences
    }
    if (/[,;:]$/.test(word)) {
      return baseDelay * 1.5; // Medium pause for commas
    }

    // Slightly longer for longer words
    if (word.length > 8) {
      return baseDelay * 1.2;
    }

    return baseDelay;
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'speed-reader-overlay hidden';
    this.overlay.innerHTML = `
      <button class="speed-reader-close" title="Close (Esc)">${icons.x}</button>

      <div class="speed-reader-display">
        <div class="speed-reader-word-container">
          <div class="speed-reader-focus-line"></div>
          <div class="speed-reader-word"></div>
          <div class="speed-reader-focus-line-bottom"></div>
        </div>
      </div>

      <div class="speed-reader-progress-container">
        <div class="speed-reader-progress">
          <div class="speed-reader-progress-bar"></div>
        </div>
        <div class="speed-reader-progress-text">
          <span class="current-word">0</span>
          <span class="total-words">0 words</span>
        </div>
      </div>

      <div class="speed-reader-controls">
        <button class="speed-reader-btn" id="sr-restart" title="Restart (R)">${icons.rotateCcw}</button>
        <button class="speed-reader-btn" id="sr-skip-back" title="Back 10 words">${icons.rewind}</button>
        <button class="speed-reader-btn primary" id="sr-play-pause" title="Play/Pause (Space)">${icons.play}</button>
        <button class="speed-reader-btn" id="sr-skip-forward" title="Forward 10 words">${icons.fastForward}</button>
      </div>

      <div class="speed-reader-wpm-container">
        <div class="speed-reader-wpm-label">Words per minute</div>
        <div class="speed-reader-wpm-value">300</div>
        <div class="speed-reader-slider-container">
          <span class="speed-reader-slider-bounds">100</span>
          <input type="range" class="speed-reader-slider" min="100" max="800" value="300" step="25">
          <span class="speed-reader-slider-bounds">800</span>
        </div>
      </div>

      <div class="speed-reader-instructions">
        <kbd>Space</kbd> Play/Pause
        <kbd>←</kbd><kbd>→</kbd> Skip words
        <kbd>↑</kbd><kbd>↓</kbd> Adjust WPM
        <kbd>R</kbd> Restart
        <kbd>Esc</kbd> Close
      </div>
    `;

    document.body.appendChild(this.overlay);

    // Cache DOM elements
    this.wordDisplay = this.overlay.querySelector('.speed-reader-word');
    this.progressBar = this.overlay.querySelector('.speed-reader-progress-bar');
    this.currentWordSpan = this.overlay.querySelector('.current-word');
    this.totalWordsSpan = this.overlay.querySelector('.total-words');
    this.playPauseBtn = this.overlay.querySelector('#sr-play-pause');
    this.wpmSlider = this.overlay.querySelector('.speed-reader-slider');
    this.wpmValue = this.overlay.querySelector('.speed-reader-wpm-value');
    this.focusLineTop = this.overlay.querySelector('.speed-reader-focus-line');
    this.focusLineBottom = this.overlay.querySelector('.speed-reader-focus-line-bottom');
  }

  setupEventListeners() {
    // Close button
    this.overlay.querySelector('.speed-reader-close').addEventListener('click', () => this.close());

    // Play/Pause
    this.playPauseBtn.addEventListener('click', () => this.togglePlay());

    // Skip controls
    this.overlay.querySelector('#sr-restart').addEventListener('click', () => this.restart());
    this.overlay.querySelector('#sr-skip-back').addEventListener('click', () => this.skip(-10));
    this.overlay.querySelector('#sr-skip-forward').addEventListener('click', () => this.skip(10));

    // WPM slider
    this.wpmSlider.addEventListener('input', (e) => {
      this.wpm = parseInt(e.target.value);
      this.updateWpmDisplay();
      this.saveSettings();

      // Restart interval with new speed if playing
      if (this.isPlaying) {
        this.stopInterval();
        this.startInterval();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.overlay.classList.contains('hidden')) {
        this.handleKeyboard(e);
      }
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'startSpeedReading') {
        this.start(message.text);
      } else if (message.action === 'toggleSpeedReader') {
        this.handleToggle();
      }
    });
  }

  handleKeyboard(e) {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.togglePlay();
        break;
      case 'Escape':
        this.close();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.skip(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.skip(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.adjustWpm(25);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.adjustWpm(-25);
        break;
      case 'r':
      case 'R':
        this.restart();
        break;
    }
  }

  handleToggle() {
    if (this.overlay.classList.contains('hidden')) {
      // Check for selected text
      const selectedText = window.getSelection().toString().trim();
      if (selectedText) {
        this.start(selectedText);
      } else {
        this.showPrompt();
      }
    } else {
      this.close();
    }
  }

  showPrompt() {
    this.overlay.classList.remove('hidden');
    this.wordDisplay.innerHTML = '';
    this.overlay.querySelector('.speed-reader-display').innerHTML = `
      <div class="speed-reader-prompt">
        <strong>Select text on the page</strong><br>
        then right-click and choose "Speed Read Selection"<br>
        or click the extension icon again
      </div>
    `;
  }

  start(text) {
    // Parse text into words
    this.words = text
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(w => w.length > 0);

    if (this.words.length === 0) return;

    this.currentIndex = 0;
    this.isPlaying = false;

    // Restore display area if showing prompt
    const displayArea = this.overlay.querySelector('.speed-reader-display');
    displayArea.innerHTML = `
      <div class="speed-reader-word-container">
        <div class="speed-reader-focus-line"></div>
        <div class="speed-reader-word"></div>
        <div class="speed-reader-focus-line-bottom"></div>
      </div>
    `;
    this.wordDisplay = this.overlay.querySelector('.speed-reader-word');
    this.focusLineTop = this.overlay.querySelector('.speed-reader-focus-line');
    this.focusLineBottom = this.overlay.querySelector('.speed-reader-focus-line-bottom');

    // Show overlay
    this.overlay.classList.remove('hidden');

    // Update display
    this.updateDisplay();
    this.totalWordsSpan.textContent = `${this.words.length} words`;
    this.playPauseBtn.innerHTML = icons.play;

    // Position focus lines based on ORP
    this.updateFocusLines();
  }

  updateFocusLines() {
    // Center the focus lines
    this.focusLineTop.style.left = '50%';
    this.focusLineTop.style.transform = 'translateX(-50%)';
    this.focusLineBottom.style.left = '50%';
    this.focusLineBottom.style.transform = 'translateX(-50%)';
  }

  togglePlay() {
    if (this.words.length === 0) return;

    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.currentIndex >= this.words.length) {
      this.restart();
    }

    this.isPlaying = true;
    this.playPauseBtn.innerHTML = icons.pause;
    this.startInterval();
  }

  pause() {
    this.isPlaying = false;
    this.playPauseBtn.innerHTML = icons.play;
    this.stopInterval();
  }

  startInterval() {
    const showNextWord = () => {
      if (this.currentIndex >= this.words.length) {
        this.pause();
        return;
      }

      this.updateDisplay();
      const delay = this.getWordDelay(this.words[this.currentIndex]);
      this.currentIndex++;

      if (this.isPlaying) {
        this.intervalId = setTimeout(showNextWord, delay);
      }
    };

    showNextWord();
  }

  stopInterval() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  updateDisplay() {
    const word = this.words[this.currentIndex] || '';

    // Render word with ORP highlighting and center on ORP
    const orpIndex = this.calculateORP(word);
    const before = word.substring(0, orpIndex);
    const orp = word.charAt(orpIndex);
    const after = word.substring(orpIndex + 1);

    // Use padding to center the ORP character
    this.wordDisplay.innerHTML = `<span class="before-orp">${before}</span><span class="orp">${orp}</span><span class="after-orp">${after}</span>`;

    // Update progress
    const progress = ((this.currentIndex + 1) / this.words.length) * 100;
    this.progressBar.style.width = `${progress}%`;
    this.currentWordSpan.textContent = this.currentIndex + 1;
  }

  skip(amount) {
    this.currentIndex = Math.max(0, Math.min(this.words.length - 1, this.currentIndex + amount));
    this.updateDisplay();
  }

  restart() {
    this.stopInterval();
    this.currentIndex = 0;
    this.updateDisplay();

    if (this.isPlaying) {
      this.startInterval();
    }
  }

  adjustWpm(delta) {
    this.wpm = Math.max(100, Math.min(800, this.wpm + delta));
    this.wpmSlider.value = this.wpm;
    this.updateWpmDisplay();
    this.saveSettings();

    if (this.isPlaying) {
      this.stopInterval();
      this.startInterval();
    }
  }

  updateWpmDisplay() {
    this.wpmValue.textContent = this.wpm;
  }

  close() {
    this.pause();
    this.overlay.classList.add('hidden');
  }
}

// Initialize speed reader
const speedReader = new SpeedReader();
