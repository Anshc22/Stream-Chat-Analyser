// Twitch Chat Activity Monitor - Background Script (Service Worker)
// Handles extension lifecycle and coordinates between content scripts

class TwitchChatMonitorBackground {
  constructor() {
    this.activeTabs = new Map();
    this.settings = {
      enabled: true,
      showOverlay: true,
      position: 'top-right',
      theme: 'dark'
    };

    this.init();
  }

  init() {
    // Load saved settings
    this.loadSettings();

    // Set up event listeners
    this.setupEventListeners();

    console.log('Twitch Chat Monitor Background: Initialized');
  }

  setupEventListeners() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        console.log('Twitch Chat Monitor: Extension installed');
        this.handleFirstInstall();
      } else if (details.reason === 'update') {
        console.log('Twitch Chat Monitor: Extension updated');
      }
    });

    // Handle tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdate(tabId, tab);
      }
    });

    // Handle tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.activeTabs.delete(tabId);
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  handleFirstInstall() {
    // Set default settings
    chrome.storage.sync.set({
      'twitchChatMonitor': {
        enabled: true,
        showOverlay: true,
        position: 'top-right',
        theme: 'dark',
        timeWindow: 60
      }
    });

    // Open welcome page or show notification
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html') || 'https://www.twitch.tv/'
    });
  }

  handleTabUpdate(tabId, tab) {
    // Check if this is a Twitch channel page
    if (this.isTwitchChannelPage(tab.url)) {
      this.activeTabs.set(tabId, {
        url: tab.url,
        activated: true,
        lastActivity: Date.now()
      });

      console.log(`Twitch Chat Monitor: Activated on tab ${tabId}: ${tab.url}`);
    } else {
      // Remove from active tabs if it's no longer a Twitch channel
      this.activeTabs.delete(tabId);
    }
  }

  isTwitchChannelPage(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);
      // Check if it's twitch.tv and not the homepage
      if (urlObj.hostname === 'www.twitch.tv') {
        const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
        // Must have at least one path segment (channel name)
        return pathParts.length >= 1 && pathParts[0].length > 0;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'GET_SETTINGS':
          sendResponse({ success: true, settings: await this.getSettings() });
          break;

        case 'UPDATE_SETTINGS':
          await this.updateSettings(message.settings);
          sendResponse({ success: true });
          break;

        case 'GET_TAB_STATUS':
          const status = this.activeTabs.get(sender.tab?.id) || null;
          sendResponse({ success: true, status });
          break;

        case 'ACTIVITY_UPDATE':
          // Handle activity updates from content script
          this.handleActivityUpdate(sender.tab?.id, message.data);
          sendResponse({ success: true });
          break;

        case 'ERROR_REPORT':
          console.error('Twitch Chat Monitor Error:', message.error);
          // Could send to error reporting service here
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Twitch Chat Monitor: Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get('twitchChatMonitor');
      if (result.twitchChatMonitor) {
        this.settings = { ...this.settings, ...result.twitchChatMonitor };
      }
    } catch (error) {
      console.error('Twitch Chat Monitor: Error loading settings:', error);
    }
  }

  async getSettings() {
    await this.loadSettings(); // Refresh from storage
    return this.settings;
  }

  async updateSettings(newSettings) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      await chrome.storage.sync.set({
        'twitchChatMonitor': this.settings
      });

      // Notify all active tabs of settings change
      for (const [tabId] of this.activeTabs) {
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'SETTINGS_UPDATED',
            settings: this.settings
          });
        } catch (e) {
          // Tab might not be available anymore
          this.activeTabs.delete(tabId);
        }
      }

      console.log('Twitch Chat Monitor: Settings updated', this.settings);
    } catch (error) {
      console.error('Twitch Chat Monitor: Error updating settings:', error);
      throw error;
    }
  }

  handleActivityUpdate(tabId, data) {
    if (tabId) {
      const tabInfo = this.activeTabs.get(tabId);
      if (tabInfo) {
        tabInfo.lastActivity = Date.now();
        // Could store activity data for analytics here
      }
    }
  }

  // Utility method to get active tab count
  getActiveTabCount() {
    return this.activeTabs.size;
  }

  // Utility method to get extension status
  async getStatus() {
    return {
      activeTabs: this.getActiveTabCount(),
      settings: await this.getSettings(),
      version: chrome.runtime.getManifest().version
    };
  }
}

// Initialize the background script
const backgroundMonitor = new TwitchChatMonitorBackground();

// Export for debugging
if (typeof globalThis !== 'undefined') {
  globalThis.TwitchChatMonitorBackground = TwitchChatMonitorBackground;
  globalThis.backgroundMonitor = backgroundMonitor;
}
