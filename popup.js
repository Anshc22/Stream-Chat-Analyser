// Twitch Chat Monitor - Popup Script
// Handles the settings popup interface

class TwitchChatMonitorPopup {
  constructor() {
    this.settings = {
      enabled: true,
      position: 'top-right',
      theme: 'dark'
    };

    this.init();
  }

  init() {
    // Wait for DOM to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initializePopup());
    } else {
      this.initializePopup();
    }
  }

  async initializePopup() {
    // Load current settings
    await this.loadSettings();

    // Update status
    this.updateStatus();

    // Set up event listeners
    this.setupEventListeners();

    // Apply theme
    this.applyTheme();

    console.log('Twitch Chat Monitor Popup: Initialized');
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get('twitchChatMonitor');
      if (result.twitchChatMonitor) {
        this.settings = { ...this.settings, ...result.twitchChatMonitor };
      }
      this.populateForm();
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showError('Failed to load settings');
    }
  }

  populateForm() {
    // Populate form with current settings
    const enabledCheckbox = document.getElementById('enabled');
    const positionSelect = document.getElementById('position');
    const themeSelect = document.getElementById('theme');

    if (enabledCheckbox) enabledCheckbox.checked = this.settings.enabled;
    if (positionSelect) positionSelect.value = this.settings.position;
    if (themeSelect) themeSelect.value = this.settings.theme;
  }

  setupEventListeners() {
    // Form submission
    const form = document.getElementById('settings-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSave(e));
    }

    // Reset link
    const resetLink = document.getElementById('reset-link');
    if (resetLink) {
      resetLink.addEventListener('click', (e) => this.handleReset(e));
    }

    // Settings change listeners for real-time updates
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('change', () => this.handleSettingChange(input));
    });
  }

  async handleSave(e) {
    e.preventDefault();

    const saveButton = document.getElementById('save-button');
    const originalText = saveButton.textContent;

    try {
      // Update settings from form
      this.updateSettingsFromForm();

      // Save to storage and notify content scripts
      await this.saveAndNotify();

      // Show success
      saveButton.textContent = 'Saved!';
      saveButton.disabled = true;
      saveButton.style.background = '#00a82d';

      setTimeout(() => {
        saveButton.textContent = originalText;
        saveButton.disabled = false;
        saveButton.style.background = '';
      }, 2000);

      console.log('Settings saved:', this.settings);

    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showError('Failed to save settings');
      saveButton.textContent = 'Error!';
      saveButton.disabled = true;

      setTimeout(() => {
        saveButton.textContent = originalText;
        saveButton.disabled = false;
      }, 2000);
    }
  }

  async saveAndNotify() {
    // Save to storage
    await chrome.storage.sync.set({
      'twitchChatMonitor': this.settings
    });

    // Notify background script
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: this.settings
    });

    // Also notify all active tabs with content scripts
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && tab.url.includes('twitch.tv')) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings: this.settings
          });
        } catch (e) {
          // Tab might not have content script or be inactive
          console.log(`Could not notify tab ${tab.id}`);
        }
      }
    }
  }

  async handleReset(e) {
    e.preventDefault();

    if (confirm('Reset all settings to defaults?')) {
      this.settings = {
        enabled: true,
        position: 'top-right',
        theme: 'dark'
      };

      await this.saveSettings();
      this.populateForm();
      this.applyTheme();
    }
  }

  async handleSettingChange(input) {
    // Update settings object
    this.updateSettingsFromForm();

    // Apply changes immediately without requiring save
    try {
      await this.saveAndNotify();
      console.log('Setting applied immediately:', input.id, input.type === 'checkbox' ? input.checked : input.value);
    } catch (error) {
      console.error('Failed to apply setting immediately:', error);
    }
  }

  updateSettingsFromForm() {
    const enabledCheckbox = document.getElementById('enabled');
    const positionSelect = document.getElementById('position');
    const themeSelect = document.getElementById('theme');

    this.settings = {
      enabled: enabledCheckbox ? enabledCheckbox.checked : true,
      position: positionSelect ? positionSelect.value : 'top-right',
      theme: themeSelect ? themeSelect.value : 'dark'
    };
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set({
        'twitchChatMonitor': this.settings
      });

      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: this.settings
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  async updateStatus() {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab && this.isTwitchChannel(tab.url)) {
        // Check if extension is active on this tab
        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_STATUS'
        });

        if (response && response.success && response.status) {
          this.setStatus('Active', true);
        } else {
          this.setStatus('Ready', false);
        }
      } else {
        this.setStatus('Not a Twitch Channel', false);
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      this.setStatus('Error', false);
    }
  }

  isTwitchChannel(url) {
    if (!url) return false;
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'www.twitch.tv' && urlObj.pathname.split('/').filter(p => p).length >= 1;
    } catch (e) {
      return false;
    }
  }

  setStatus(text, isActive) {
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');

    if (statusText) statusText.textContent = text;
    if (statusDot) {
      statusDot.className = 'status-dot ' + (isActive ? 'active' : 'inactive');
    }
  }

  applyTheme() {
    const theme = this.settings.theme;

    if (theme === 'light') {
      document.body.style.background = '#f8f9fa';
      document.body.style.color = '#212529';
    } else if (theme === 'auto') {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (!prefersDark) {
        document.body.style.background = '#f8f9fa';
        document.body.style.color = '#212529';
      }
    }
    // Dark theme is default
  }

  showError(message) {
    // Simple error display - could be enhanced with a toast notification
    console.error(message);
    alert(message);
  }
}

// Initialize popup
const popup = new TwitchChatMonitorPopup();
