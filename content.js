// Twitch Chat Activity Monitor - Content Script
// This script runs on Twitch channel pages and monitors chat activity

class TwitchChatMonitor {
  constructor() {
    this.messagesPerMinute = 0;
    this.messagesPerSecond = 0;
    this.totalMessages = 0;
    this.messageTimestamps = [];
    this.overlay = null;
    this.observer = null;
    this.timeWindow = 60; // 60 seconds for per-minute calculation
    this.isInitialized = false;
    this.settings = {
      enabled: true,
      position: 'top-right',
      theme: 'dark'
    };
    this.savedPosition = null;
    this.currentChannel = null;
    this.urlObserver = null;
    this.monitoringStartTime = null;
    this.timerInterval = null;
    this.uniqueChatters = new Set();
    this.currentPlatform = null; // 'twitch', 'youtube', 'kick'
    this.lastMessageTime = null; // For duplicate message prevention
    this.sessionData = {
      messagesPerMinute: [],
      messagesPerSecond: [],
      viewerCounts: [],
      uniqueChatters: 0,
      totalMessages: 0,
      platform: null
    };
    this.historyModal = null;
    this.historyTableVisible = false;

    this.init();
  }

  init() {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initializeMonitor());
    } else {
      this.initializeMonitor();
    }
  }

  async loadSettings() {
    try {
      // Load settings from chrome.storage
      const result = await chrome.storage.sync.get('twitchChatMonitor');
      if (result.twitchChatMonitor) {
        this.settings = { ...this.settings, ...result.twitchChatMonitor };
      }

      // Load overlay position for this domain
      const positionKey = `overlayPosition_${window.location.hostname}`;
      const positionResult = await chrome.storage.local.get(positionKey);
      if (positionResult[positionKey]) {
        this.savedPosition = positionResult[positionKey];
      }

      console.log('Twitch Chat Monitor: Settings loaded', this.settings);
    } catch (error) {
      console.error('Twitch Chat Monitor: Error loading settings:', error);
    }
  }

  async initializeMonitor() {
    // Detect platform and validate if it's a supported livestream page
    this.currentPlatform = this.detectPlatform();
    const isValidPage = this.isValidLivestreamPage();

    console.log(`Multi-Platform Chat Monitor: Platform detection result: ${this.currentPlatform}, Valid page: ${isValidPage}`);

    if (!isValidPage) {
      console.log('Multi-Platform Chat Monitor: Not a valid livestream page');
      return;
    }

    console.log('Multi-Platform Chat Monitor: Initializing on', this.currentPlatform, '...');

    // Wait for platform to load its interface (YouTube takes longer)
    const delay = this.currentPlatform === 'youtube' ? 5000 : 3000;
    setTimeout(async () => {
      // Set initial channel and platform
      this.currentChannel = this.getChannelName();
      this.sessionData.platform = this.currentPlatform;

      // Try to setup chat observer, with retry for YouTube
      if (!this.setupChatObserver()) {
        if (this.currentPlatform === 'youtube') {
          console.log('Multi-Platform Chat Monitor: YouTube chat not ready, will retry in 3 seconds');
          setTimeout(() => {
            if (!this.setupChatObserver()) {
              console.warn('Multi-Platform Chat Monitor: Failed to setup YouTube chat observer after retry');
            }
          }, 3000);
        }
      }

      await this.createActivityOverlay();
      this.applySettingsToOverlay();
      this.setupSettingsListener();
      this.setupURLMonitoring();

      // Start the monitoring timer
      this.resetTimer();

      // Update thumbnail after a delay to ensure page is fully loaded
      setTimeout(() => {
        this.updateThumbnail();
      }, 2000);

      this.isInitialized = true;
      console.log('Multi-Platform Chat Monitor: Initialized successfully on', this.currentPlatform, 'channel:', this.currentChannel);
    }, 3000);
  }

  detectPlatform() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const url = window.location.href;

    console.log(`Multi-Platform Chat Monitor: Detecting platform for URL: ${url}`);

    if (hostname === 'www.twitch.tv') {
      console.log('Multi-Platform Chat Monitor: Detected Twitch');
      return 'twitch';
    } else if (hostname === 'www.youtube.com') {
      // Check if it's a live video (contains 'v=' parameter and might have live indicators)
      if (pathname.includes('/watch')) {
        console.log('Multi-Platform Chat Monitor: Detected YouTube watch page');
        return 'youtube';
      } else {
        console.log('Multi-Platform Chat Monitor: YouTube page but not watch page');
        return null;
      }
    } else if (hostname === 'kick.com') {
      // Kick.com channel pages have format /channelname
      const pathParts = pathname.split('/').filter(p => p);
      if (pathParts.length === 1) {
        console.log('Multi-Platform Chat Monitor: Detected Kick channel page');
        return 'kick';
      } else {
        console.log('Multi-Platform Chat Monitor: Kick page but not channel page');
        return null;
      }
    }

    console.log(`Multi-Platform Chat Monitor: Unknown platform for hostname: ${hostname}`);
    return null;
  }

  isValidLivestreamPage() {
    const platform = this.detectPlatform();
    if (!platform) return false;

    const url = window.location.href;

    switch (platform) {
      case 'twitch':
        // Check if it's a Twitch channel page (not homepage, search, etc.)
        const twitchRegex = /^https:\/\/www\.twitch\.tv\/[a-zA-Z0-9_]{1,25}(?:\?.*)?$/;
        return twitchRegex.test(url);

      case 'youtube':
        // Check if it's a YouTube video page
        return url.includes('/watch?v=');

      case 'kick':
        // Check if it's a Kick channel page
        const kickRegex = /^https:\/\/kick\.com\/[a-zA-Z0-9_-]+$/;
        return kickRegex.test(url);

      default:
        return false;
    }
  }

  isValidTwitchChannel() {
    const url = window.location.href;
    // Check if it's a Twitch channel page (not homepage, search, etc.)
    const channelRegex = /^https:\/\/www\.twitch\.tv\/[a-zA-Z0-9_]{1,25}(?:\?.*)?$/;
    return channelRegex.test(url);
  }

  getChannelName() {
    try {
      const url = new URL(window.location.href);
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);

      switch (this.currentPlatform) {
        case 'twitch':
          if (pathParts.length > 0) {
            return pathParts[0].charAt(0).toUpperCase() + pathParts[0].slice(1);
          }
          return 'Twitch Streamer';

        case 'youtube':
          // Try to get channel name from YouTube-specific elements
          const ytChannelSelectors = [
            // Channel name in video owner section
            '.ytd-channel-name a',
            '.ytd-video-owner-renderer .ytd-channel-name',
            '#channel-name a',
            '#owner #channel-name',
            '#meta #channel-name',
            // Channel link text
            'a[href*="/channel/"]',
            'a[href*="/c/"]',
            'a[href*="/user/"]',
            // Channel name in video meta
            '.ytd-video-meta-block #channel-name',
            '.ytd-video-owner-renderer #channel-name'
          ];

          for (const selector of ytChannelSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              const channelName = element.textContent?.trim();
              if (channelName && channelName.length > 0 && channelName !== 'YouTube') {
                console.log('Multi-Platform Chat Monitor: Found YouTube channel name:', channelName, 'using selector:', selector);
                return channelName;
              }
            }
          }

          // Fallback to URL extraction (channel ID from URL)
          const url = window.location.href;
          const channelMatch = url.match(/[?&]channel=([^&]+)/) || url.match(/\/channel\/([^/?]+)/) || url.match(/\/c\/([^/?]+)/) || url.match(/\/user\/([^/?]+)/);
          if (channelMatch && channelMatch[1]) {
            console.log('Multi-Platform Chat Monitor: Extracted channel from URL:', channelMatch[1]);
            return channelMatch[1].charAt(0).toUpperCase() + channelMatch[1].slice(1);
          }

          // Last resort: use page title but try to extract channel name more intelligently
          const title = document.title;
          if (title && title.includes(' - YouTube')) {
            const streamTitle = title.replace(' - YouTube', '').trim();
            // Try to find channel name in meta tags
            const channelMeta = document.querySelector('meta[itemprop="channelId"]') ||
                               document.querySelector('meta[name="twitter:creator"]') ||
                               document.querySelector('meta[property="og:video:author"]');

            if (channelMeta) {
              const channelFromMeta = channelMeta.getAttribute('content');
              if (channelFromMeta) {
                return channelFromMeta.charAt(0).toUpperCase() + channelFromMeta.slice(1);
              }
            }

            // If we can't find better, return the stream title but indicate it's a fallback
            console.log('Multi-Platform Chat Monitor: Using stream title as fallback for YouTube channel name');
            return streamTitle;
          }

          return 'YouTube Channel';

        case 'kick':
          if (pathParts.length > 0) {
            return pathParts[0].charAt(0).toUpperCase() + pathParts[0].slice(1);
          }
          return 'Kick Streamer';

        default:
          return 'Livestream';
      }
    } catch (e) {
      console.warn('Multi-Platform Chat Monitor: Could not extract channel name from URL');
    }
    return 'Livestream';
  }

  getChannelThumbnail(channelName) {
    // Get thumbnail based on platform
    const cleanChannelName = channelName.toLowerCase().replace(/[^a-z0-9_]/g, '');

    switch (this.currentPlatform) {
      case 'twitch':
        // Try to get the profile image from the current Twitch page
        const pageAvatar = this.getAvatarFromPage();
        if (pageAvatar) {
          return pageAvatar;
        }
        // Fallback: Use Twitch's default profile image pattern
        return `https://static-cdn.jtvnw.net/jtv_user_pictures/${cleanChannelName}-profile_image-70x70.png`;

      case 'youtube':
        // For YouTube, try to find channel avatar or use a generic icon
        const ytAvatar = this.getYouTubeAvatar();
        if (ytAvatar) {
          return ytAvatar;
        }
        return 'https://www.youtube.com/s/desktop/1a6c8b83/img/favicon_144x144.png';

      case 'kick':
        // For Kick, try to find channel avatar
        const kickAvatar = this.getKickAvatar();
        if (kickAvatar) {
          return kickAvatar;
        }
        return 'https://kick.com/favicon.ico';

      default:
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMzMzMzMzMiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0xMiAxMk0xMiAxNk0xNiAxMiIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4KPC9zdmc+';
    }
  }

  getAvatarFromPage() {
    // Try to find the STREAMER/CHANNEL avatar (not viewer's avatar)
    // Look for specific selectors that Twitch uses for the channel being viewed

    // Priority 1: Channel/streamer specific selectors
    const streamerSelectors = [
      // Main channel header avatar
      '.channel-header__user-avatar img',
      '.channel-info__avatar img',
      '.stream-avatar img',
      '.channel-root__info img',

      // Live channel specific
      '.live-channel-header__avatar img',
      '.channel-header-avatar img',

      // Generic but specific to channel context
      'img[alt*="channel"]',
      'img[alt*="streamer"]',
      'img[data-a-target*="channel"]',

      // Look for avatar in channel info section
      '.channel-info-section img',
      '.channel-header-content img'
    ];

    // Try streamer-specific selectors first
    for (const selector of streamerSelectors) {
      const img = document.querySelector(selector);
      if (img && img.src && img.src.includes('jtv_user_pictures') && img.src.includes('profile_image')) {
        console.log('Twitch Chat Monitor: Found streamer avatar with selector:', selector);
        return img.src.replace(/(\d+)x(\d+)/, '70x70');
      }
    }

    // Priority 2: Look for the largest profile image (likely the streamer)
    const allProfileImages = document.querySelectorAll('img[src*="jtv_user_pictures"][src*="profile_image"]');
    let largestImage = null;
    let largestArea = 0;

    for (const img of allProfileImages) {
      const area = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
      if (area > largestArea) {
        largestArea = area;
        largestImage = img;
      }
    }

    if (largestImage) {
      console.log('Twitch Chat Monitor: Using largest profile image as streamer avatar');
      return largestImage.src.replace(/(\d+)x(\d+)/, '70x70');
    }

    // Priority 3: Fallback to any profile image that's visible and reasonably sized
    const visibleProfileImages = Array.from(allProfileImages).filter(img => {
      const rect = img.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20 && rect.top > 0;
    });

    if (visibleProfileImages.length > 0) {
      const img = visibleProfileImages[0];
      console.log('Twitch Chat Monitor: Using visible profile image as streamer avatar');
      return img.src.replace(/(\d+)x(\d+)/, '70x70');
    }

    console.log('Twitch Chat Monitor: No suitable streamer avatar found on page');
    return null;
  }

  updateThumbnail() {
    if (!this.overlay) return;

    const thumbnailElement = this.overlay.querySelector('.channel-thumbnail');
    if (!thumbnailElement) return;

    const channelName = this.getChannelName();
    console.log('Multi-Platform Chat Monitor: Updating thumbnail for channel:', channelName, 'platform:', this.currentPlatform);

    // Get avatar based on platform
    let avatarUrl = null;

    switch (this.currentPlatform) {
      case 'twitch':
        avatarUrl = this.getAvatarFromPage();
        break;
      case 'youtube':
        avatarUrl = this.getYouTubeAvatar();
        break;
      case 'kick':
        avatarUrl = this.getKickAvatar();
        break;
      default:
        avatarUrl = this.getAvatarFromPage(); // Fallback to Twitch method
    }

    if (avatarUrl && avatarUrl !== thumbnailElement.src) {
      console.log('Multi-Platform Chat Monitor: Updating thumbnail from page:', avatarUrl);
      thumbnailElement.src = avatarUrl;
      thumbnailElement.alt = `${channelName} avatar`;
      thumbnailElement.style.display = 'block';
    } else if (!avatarUrl) {
      // Try fallback URLs based on platform
      let fallbackUrl = null;

      switch (this.currentPlatform) {
        case 'twitch':
          fallbackUrl = `https://static-cdn.jtvnw.net/jtv_user_pictures/${channelName.toLowerCase().replace(/[^a-z0-9_]/g, '')}-profile_image-70x70.png`;
          break;
        case 'youtube':
          fallbackUrl = 'https://www.youtube.com/s/desktop/1a6c8b83/img/favicon_144x144.png';
          break;
        case 'kick':
          fallbackUrl = 'https://kick.com/favicon.ico';
          break;
        default:
          fallbackUrl = 'https://www.youtube.com/s/desktop/1a6c8b83/img/favicon_144x144.png';
      }

      if (fallbackUrl && fallbackUrl !== thumbnailElement.src) {
        console.log('Multi-Platform Chat Monitor: Using fallback thumbnail:', fallbackUrl);
        thumbnailElement.src = fallbackUrl;
        thumbnailElement.alt = `${channelName} avatar (fallback)`;
        thumbnailElement.style.display = 'block';
      }
    }

    // Always update the channel name display
    const channelNameElement = this.overlay.querySelector('.channel-name');
    if (channelNameElement) {
      channelNameElement.textContent = channelName;
    }

    // Update current channel tracking
    this.currentChannel = channelName;
  }

  setupChatObserver() {
    // Find the chat container - different platforms have different structures
    const chatContainer = this.findChatContainer();

    if (!chatContainer) {
      console.warn('Multi-Platform Chat Monitor: Could not find chat container for', this.currentPlatform);
      return false;
    }

    // Handle iframes (YouTube uses iframes for chat)
    if (this.currentPlatform === 'youtube' && chatContainer.tagName === 'IFRAME') {
      return this.setupYouTubeIframeObserver(chatContainer);
    }

    // Set up MutationObserver for regular elements
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.processNewMessages(node);
            }
          });
        }
      });
    });

    // Start observing
    this.observer.observe(chatContainer, {
      childList: true,
      subtree: true
    });

    console.log('Multi-Platform Chat Monitor: Chat observer started for', this.currentPlatform);
    return true;
  }

  setupYouTubeIframeObserver(iframe) {
    console.log('Multi-Platform Chat Monitor: Setting up YouTube iframe observer');

    // Check if iframe is already loaded
    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
      this.attachYouTubeIframeObserver(iframe);
      return true;
    }

    // Wait for iframe to load
    iframe.addEventListener('load', () => {
      console.log('Multi-Platform Chat Monitor: YouTube iframe loaded');
      this.attachYouTubeIframeObserver(iframe);
    });

    // Also try to attach immediately in case it's already loaded
    setTimeout(() => {
      if (!this.observer) {
        this.attachYouTubeIframeObserver(iframe);
      }
    }, 1000);

    return true;
  }

  attachYouTubeIframeObserver(iframe) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

      if (!iframeDoc) {
        console.warn('Multi-Platform Chat Monitor: Cannot access YouTube iframe content');
        return;
      }

      // Find the actual chat container within the iframe
      const iframeChatSelectors = [
        '#chat-messages',
        '#items',
        'yt-live-chat-item-list-renderer #contents',
        'yt-live-chat-item-list-renderer',
        '[class*="live-chat"]',
        '#chat #items'
      ];

      let iframeChatContainer = null;
      for (const selector of iframeChatSelectors) {
        iframeChatContainer = iframeDoc.querySelector(selector);
        if (iframeChatContainer) {
          console.log('Multi-Platform Chat Monitor: Found YouTube iframe chat container with selector:', selector);
          break;
        }
      }

      if (!iframeChatContainer) {
        console.warn('Multi-Platform Chat Monitor: Could not find chat container inside YouTube iframe');
        return;
      }

      // Set up MutationObserver on the iframe's chat container
      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Pass the iframe document context for YouTube
                this.processNewMessages(node, this.currentPlatform === 'youtube' ? iframeDoc : document);
              }
            });
          }
        });
      });

      // Start observing the iframe's chat container
      this.observer.observe(iframeChatContainer, {
        childList: true,
        subtree: true
      });

      console.log('Multi-Platform Chat Monitor: YouTube iframe chat observer attached successfully');

    } catch (error) {
      console.error('Multi-Platform Chat Monitor: Error setting up YouTube iframe observer:', error);
    }
  }

  findChatContainer() {
    let selectors = [];

    switch (this.currentPlatform) {
      case 'twitch':
        // Twitch chat selectors
        selectors = [
          '[data-a-target="chat-scroller"]',
          '.chat-scrollable-area__message-container',
          '.chat-list',
          '.chat-list--default',
          '.chat-list--other',
          '#chat-room__content'
        ];
        break;

      case 'youtube':
        // YouTube live chat selectors - more comprehensive
        selectors = [
          'yt-live-chat-app',
          'yt-live-chat-app #contents',
          'yt-live-chat-app #contents #chat-messages',
          '#chat-messages',
          '#items.yt-live-chat-item-list-renderer',
          'yt-live-chat-item-list-renderer #contents',
          '#live-chat-iframe',
          'iframe[src*="live_chat"]',
          '#chat #items',
          '#contents #chat',
          '[class*="live-chat"]',
          '[class*="chat-messages"]',
          '#live-chat-messages'
        ];
        break;

      case 'kick':
        // Kick chat selectors - more comprehensive
        selectors = [
          '#chatroom-messages',
          '#chatroom-messages .group.relative',
          '#chatroom-messages [class*="message"]',
          '.chat-messages',
          '.chat-container .messages',
          '.chat-room__messages',
          '.chat-messages-container',
          '[class*="chat-messages"]',
          '[class*="messages-container"]',
          '[data-testid*="chat"]',
          '[role="log"]',
          '.chat-log',
          '.messages-list',
          '#messages-container'
        ];
        break;

      default:
        // Fallback selectors
        selectors = [
          '[data-a-target="chat-scroller"]',
          '.chat-messages',
          '#chat-messages',
          '.chat-list'
        ];
    }

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`Multi-Platform Chat Monitor: Found chat container for ${this.currentPlatform} with selector: ${selector}`);
        // Log some details about the element for debugging
        console.log(`Multi-Platform Chat Monitor: Chat container details:`, {
          tagName: element.tagName,
          className: element.className,
          id: element.id,
          childElementCount: element.childElementCount
        });
        return element;
      }
    }

    console.warn(`Multi-Platform Chat Monitor: No chat container found for ${this.currentPlatform} with known selectors`);
    // Log all available selectors that were tried
    console.log(`Multi-Platform Chat Monitor: Tried selectors for ${this.currentPlatform}:`, JSON.stringify(selectors));
    return null;
  }

  processNewMessages(node, doc = document) {
    let messageSelectors = [];

    switch (this.currentPlatform) {
      case 'twitch':
        messageSelectors = ['[data-a-target="chat-message-text"]', '.message', '.chat-message'];
        break;
      case 'youtube':
        messageSelectors = [
          '#message',
          '#message span',
          '.yt-live-chat-text-message-renderer #message',
          '.style-scope.yt-live-chat-text-message-renderer #message',
          '[class*="live-chat-text-message"] #message',
          'yt-live-chat-text-message-renderer #message',
          '[id="message"]',
          '[data-message-id] #message',
          // Additional message content selectors
          '.style-scope.yt-live-chat-text-message-renderer',
          '.yt-live-chat-text-message-renderer',
          '[class*="live-chat-text"]',
          '[class*="message"]',
          '[class*="live-chat"]'
        ];
        break;
      case 'kick':
        messageSelectors = [
          '.font-normal.leading-\\[1\\.55\\]',
          '.group.relative .font-normal',
          '[class*="font-normal"]',
          '.chat-message',
          '.message',
          '[class*="message"]',
          '[data-testid*="message"]',
          '.chat-line',
          '.message-item'
        ];
        break;
      default:
        messageSelectors = ['.message', '.chat-message', '[data-a-target="chat-message-text"]'];
    }

    // Look for message elements within the added node
    const messageElements = node.querySelectorAll ?
      node.querySelectorAll(messageSelectors.join(', ')) :
      [];

    let processedMessage = false;

    messageElements.forEach(messageElement => {
      if (this.isNewMessage(messageElement)) {
        console.log(`Multi-Platform Chat Monitor: Processing ${this.currentPlatform} message element:`, messageElement.outerHTML?.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '...');

        const username = this.extractUsername(messageElement, doc);
        if (!username) {
          // Log more details for debugging
          console.log(`Multi-Platform Chat Monitor: Failed to extract username from ${this.currentPlatform} message element:`, messageElement.outerHTML?.substring(0, 200).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '...');
          console.log(`Multi-Platform Chat Monitor: Recording message without username from ${this.currentPlatform}`);
        } else {
          console.log(`Multi-Platform Chat Monitor: Successfully extracted username "${username}" from ${this.currentPlatform}`);
        }
        this.recordMessage(username);
        processedMessage = true;
      }
    });

    // Only check if the node itself is a message if we haven't already processed message elements within it
    if (!processedMessage && this.isMessageElement(node, doc)) {
      console.log(`Multi-Platform Chat Monitor: Processing ${this.currentPlatform} node as message:`, node.outerHTML?.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '...');

      const username = this.extractUsername(node, doc);
      if (!username) {
        console.log(`Multi-Platform Chat Monitor: Failed to extract username from ${this.currentPlatform} node:`, node.outerHTML?.substring(0, 200).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '...');
        console.log(`Multi-Platform Chat Monitor: Recording message without username from ${this.currentPlatform} node`);
      } else {
        console.log(`Multi-Platform Chat Monitor: Successfully extracted username "${username}" from ${this.currentPlatform} node`);
      }
      this.recordMessage(username);
    }
  }

  isMessageElement(element, doc = document) {
    // Check if element looks like a chat message based on platform
    if (!element || (!element.hasAttribute && !element.classList)) return false;

    switch (this.currentPlatform) {
      case 'twitch':
        return element.hasAttribute('data-a-target') && element.getAttribute('data-a-target').includes('message') ||
               element.classList.contains('message') ||
               element.classList.contains('chat-message') ||
               element.classList.contains('chat-line__message');

      case 'youtube':
        return element.classList.contains('yt-live-chat-text-message-renderer') ||
               element.id === 'message' ||
               element.classList.contains('message') ||
               element.hasAttribute('data-message-id') ||
               element.classList.contains('live-chat');

      case 'kick':
        return element.classList.contains('chat-message') ||
               element.classList.contains('message') ||
               element.classList.contains('font-normal') ||
               element.classList.contains('leading-[1.55]') ||
               element.classList.contains('chat-line') ||
               element.classList.contains('message-item') ||
               element.hasAttribute('data-testid') && element.getAttribute('data-testid').includes('message');

      default:
        return element.classList.contains('message') ||
               element.classList.contains('chat-message');
    }
  }

  isNewMessage(messageElement) {
    // Simple check to avoid counting the same message multiple times
    // In a more robust implementation, we'd use message IDs or timestamps
    return messageElement && messageElement.textContent && messageElement.textContent.trim().length > 0;
  }

  extractUsername(messageElement, doc = document) {
    console.log(`Multi-Platform Chat Monitor: Extracting username for ${this.currentPlatform}`);
    switch (this.currentPlatform) {
      case 'twitch':
        return this.extractTwitchUsername(messageElement, doc);
      case 'youtube':
        return this.extractYouTubeUsername(messageElement, doc);
      case 'kick':
        return this.extractKickUsername(messageElement, doc);
      default:
        return this.extractTwitchUsername(messageElement, doc);
    }
  }

  extractTwitchUsername(messageElement, doc = document) {
    // Try to find username from various Twitch chat structures
    const usernameSelectors = [
      '[data-a-user]', // Common Twitch username attribute
      '.chat-author__display-name',
      '.message-author',
      '.username',
      '.user-display-name',
      '.chat-message-author'
    ];

    // Try direct parent/sibling traversal for username
    for (const selector of usernameSelectors) {
      const usernameElement = messageElement.closest('[data-a-user]') ||
                             messageElement.querySelector(selector) ||
                             messageElement.parentElement?.querySelector(selector);

      if (usernameElement) {
        const username = usernameElement.getAttribute('data-a-user') ||
                        usernameElement.textContent?.trim() ||
                        usernameElement.innerText?.trim();
        if (username && username.length > 0) {
          console.log('Multi-Platform Chat Monitor: Extracted Twitch username:', username);
          return username;
        }
      }
    }

    // Try to find username in chat line structure
    const chatLine = messageElement.closest('.chat-line') ||
                   messageElement.closest('[data-a-target*="message"]') ||
                   messageElement.closest('.message');

    if (chatLine) {
      const usernameElement = chatLine.querySelector('[data-a-user]');
      if (usernameElement) {
        const username = usernameElement.getAttribute('data-a-user');
        if (username) {
          console.log('Multi-Platform Chat Monitor: Extracted username from chat line:', username);
          return username;
        }
      }
    }

    // Fallback: try to extract from aria-label or other attributes
    const ariaLabel = messageElement.getAttribute('aria-label') ||
                     messageElement.parentElement?.getAttribute('aria-label');

    if (ariaLabel && ariaLabel.includes('message from')) {
      const match = ariaLabel.match(/message from ([^\s,]+)/);
      if (match && match[1]) {
        console.log('Multi-Platform Chat Monitor: Extracted username from aria-label:', match[1]);
        return match[1];
      }
    }

    console.log('Multi-Platform Chat Monitor: Could not extract Twitch username from message');
    return null;
  }

  extractYouTubeUsername(messageElement, doc = document) {
    console.log('Multi-Platform Chat Monitor: YouTube username extraction starting from element:', messageElement.outerHTML?.substring(0, 200) + '...');

    // YouTube live chat structure: username is usually in the parent container
    // Find the message container (parent of the message span)
    const messageContainer = messageElement.closest('yt-live-chat-text-message-renderer') ||
                           messageElement.closest('[class*="live-chat-text-message"]') ||
                           messageElement.closest('.style-scope.yt-live-chat-text-message-renderer') ||
                           messageElement.parentElement?.parentElement ||
                           messageElement.parentElement;

    console.log('Multi-Platform Chat Monitor: YouTube message container found:', messageContainer?.outerHTML?.substring(0, 500) + '...');

    // Debug: Log all child elements to understand the structure
    if (messageContainer) {
      console.log('Multi-Platform Chat Monitor: YouTube message container children:', Array.from(messageContainer.children).map(child => ({
        tagName: child.tagName,
        id: child.id,
        className: child.className,
        textContent: child.textContent?.substring(0, 100)
      })));
      // Look for username elements within the message container
      const usernameSelectors = [
        '#author-name',
        '#author-name a',
        '#author-name span',
        '.yt-live-chat-author-chip',
        '.yt-live-chat-author-chip a',
        '.yt-live-chat-author-chip span',
        '[class*="author-name"]',
        '[class*="author-name"] a',
        '[class*="author-name"] span',
        '[author-name]',
        '[data-author-name]',
        '.author-name',
        '.author-name a',
        '.author-name span',
        // Additional YouTube-specific selectors
        '.style-scope.yt-live-chat-text-message-renderer #author-name',
        '.style-scope.yt-live-chat-text-message-renderer .yt-live-chat-author-chip',
        '[class*="author"]',
        '[class*="author"] a',
        '[class*="author"] span',
        'a[href*="/channel/"]',
        'a[href*="/user/"]',
        'a[href*="/c/"]'
      ];

      for (const selector of usernameSelectors) {
        const usernameElement = messageContainer.querySelector(selector);

        if (usernameElement) {
          let username = usernameElement.textContent?.trim() ||
                        usernameElement.innerText?.trim() ||
                        usernameElement.getAttribute('author-name') ||
                        usernameElement.getAttribute('data-author-name');

          // Extract from href if it's a link
          if (!username && usernameElement.href) {
            const match = usernameElement.href.match(/[\/@]([^\/@?&]+)$/);
            if (match) {
              username = match[1];
            }
          }

          // Filter out common non-username text
          if (username && username.length > 0 &&
              username !== 'Chat' &&
              !username.includes('message') &&
              !username.includes('from') &&
              username.length < 50 &&
              !/^\d{1,2}:\d{2}/.test(username)) { // Exclude timestamps
            console.log('Multi-Platform Chat Monitor: Extracted YouTube username:', username, 'using selector:', selector);
            return username;
          }
        }
      }
    }

    // Fallback: try original selectors on the original message element
    const fallbackSelectors = [
      '#author-name',
      '.yt-live-chat-author-chip',
      '[class*="author"]',
      '[class*="username"]',
      '[author-name]',
      '[data-author-name]',
      '.author-name'
    ];

    for (const selector of fallbackSelectors) {
      const usernameElement = messageElement.querySelector(selector) ||
                             messageElement.closest(selector);

      if (usernameElement) {
        let username = usernameElement.textContent?.trim() ||
                      usernameElement.innerText?.trim() ||
                      usernameElement.getAttribute('author-name') ||
                      usernameElement.getAttribute('data-author-name');

        // Extract from href if it's a link
        if (!username && usernameElement.href) {
          const match = usernameElement.href.match(/[\/@]([^\/@?&]+)$/);
          if (match) {
            username = match[1];
          }
        }

        if (username && username.length > 0 && username !== 'Chat' &&
            !username.includes('message') && !username.includes('from') &&
            username.length < 50 && !/^\d{1,2}:\d{2}/.test(username)) {
          console.log('Multi-Platform Chat Monitor: Extracted YouTube username from fallback:', username, 'using selector:', selector);
          return username;
        }
      }
    }

    console.log('Multi-Platform Chat Monitor: Could not extract YouTube username from message element');
    return null;
  }

  extractKickUsername(messageElement, doc = document) {
    // First, try to find the full message container (not just the message content)
    const messageContainer = messageElement.closest('[class*="message"]') ||
                           messageElement.closest('[class*="chat-message"]') ||
                           messageElement.closest('.group.relative') ||
                           messageElement.closest('[data-testid*="message"]') ||
                           messageElement.parentElement?.parentElement ||
                           messageElement.parentElement;

    console.log('Multi-Platform Chat Monitor: Kick message container found:', messageContainer?.outerHTML?.substring(0, 300) + '...');

    // Try to find username in the message container first
    if (messageContainer && messageContainer !== messageElement) {
      const containerSelectors = [
        'button[title]',
        '.inline-flex button[title]',
        '[class*="inline-flex"] button[title]',
        'button.inline',
        '.chat-author',
        '.message-author',
        '.username',
        '[class*="author"]',
        '[data-username]',
        '[data-user]',
        '.user-name',
        '.chat-user',
        'a[href*="/"]',
        '[role="button"]',
        // Additional selectors for Kick's structure
        '.font-semibold',
        '.font-bold',
        '[class*="font-semibold"]',
        '[class*="font-bold"]',
        '.text-sm',
        '.text-xs'
      ];

      for (const selector of containerSelectors) {
        const usernameElement = messageContainer.querySelector(selector);

        if (usernameElement) {
          let username = usernameElement.getAttribute('title') ||
                        usernameElement.getAttribute('data-username') ||
                        usernameElement.getAttribute('data-user') ||
                        usernameElement.textContent?.trim() ||
                        usernameElement.innerText?.trim();

          // Extract username from href if it's a link
          if (!username && usernameElement.href) {
            const match = usernameElement.href.match(/\/([^\/]+)$/);
            if (match) {
              username = match[1];
            }
          }

          // Filter out common non-username text
          if (username && username.length > 0 && username !== 'Chat' &&
              !username.includes('message') && !username.includes('from') &&
              username.length < 50) { // Reasonable username length
            console.log('Multi-Platform Chat Monitor: Extracted Kick username from container:', username);
            return username;
          }
        }
      }
    }

    // Fallback: try original selectors on the original message element
    const usernameSelectors = [
      'button[title]',
      '.inline-flex button[title]',
      '[class*="inline-flex"] button[title]',
      'button.inline',
      '.chat-author',
      '.message-author',
      '.username',
      '[class*="author"]',
      '[data-username]',
      '[data-user]',
      '.user-name',
      '.chat-user',
      'a[href*="/"]',
      '[role="button"]'
    ];

    for (const selector of usernameSelectors) {
      const usernameElement = messageElement.querySelector(selector) ||
                             messageElement.closest(selector);

      if (usernameElement) {
        let username = usernameElement.getAttribute('title') ||
                      usernameElement.getAttribute('data-username') ||
                      usernameElement.getAttribute('data-user') ||
                      usernameElement.textContent?.trim() ||
                      usernameElement.innerText?.trim();

        // Extract username from href if it's a link
        if (!username && usernameElement.href) {
          const match = usernameElement.href.match(/\/([^\/]+)$/);
          if (match) {
            username = match[1];
          }
        }

        if (username && username.length > 0 && username !== 'Chat' &&
            !username.includes('message') && !username.includes('from') &&
            username.length < 50) {
          console.log('Multi-Platform Chat Monitor: Extracted Kick username from fallback:', username);
          return username;
        }
      }
    }

    console.log('Multi-Platform Chat Monitor: Could not extract Kick username from message element:', messageElement.outerHTML?.substring(0, 300) + '...');
    return null;
  }

  getYouTubeAvatar() {
    // Try to find YouTube channel avatar with comprehensive selectors
    const ytSelectors = [
      // Main channel avatar selectors
      '.ytd-video-owner-renderer img',
      '#avatar img',
      '#channel-avatar img',
      '.channel-avatar img',
      '.ytd-channel-renderer img',

      // Video owner section avatars
      '.ytd-video-meta-block img',
      '#owner img',
      '#meta img',

      // Generic avatar selectors with better specificity
      'img[alt*="avatar"]',
      'img[alt*="channel"]',
      '[class*="avatar"] img',
      '[class*="channel"] img',

      // YouTube specific classes
      'yt-img-shadow img',
      'ytd-channel-thumbnail img',

      // Try to find profile images in channel links
      'a[href*="/channel/"] img',
      'a[href*="/c/"] img',
      'a[href*="/user/"] img',

      // Look for images in the video owner section specifically
      '.ytd-video-owner-renderer .yt-img-shadow img',
      '#owner-sub-count',
      '#owner-container img'
    ];

    console.log('Multi-Platform Chat Monitor: Searching for YouTube avatar with selectors');

    for (const selector of ytSelectors) {
      const img = document.querySelector(selector);
      if (img && img.src) {
        // Filter out generic YouTube icons and small images
        if (!img.src.includes('favicon') &&
            !img.src.includes('default-avatar') &&
            img.src.includes('http') &&
            (img.naturalWidth > 32 || img.width > 32 || img.offsetWidth > 32)) {
          console.log('Multi-Platform Chat Monitor: Found YouTube avatar with selector:', selector, 'src:', img.src.substring(0, 100) + '...');
          return img.src;
        }
      }
    }

    // Try to find the channel thumbnail in the video owner section specifically
    const videoOwnerSection = document.querySelector('.ytd-video-owner-renderer') ||
                             document.querySelector('#owner') ||
                             document.querySelector('#meta');

    if (videoOwnerSection) {
      const ownerImages = videoOwnerSection.querySelectorAll('img');
      for (const img of ownerImages) {
        if (img.src && !img.src.includes('favicon') && !img.src.includes('default-avatar')) {
          console.log('Multi-Platform Chat Monitor: Found YouTube avatar in video owner section:', img.src.substring(0, 100) + '...');
          return img.src;
        }
      }
    }

    // Try to find channel avatar by looking for profile images near channel names
    const channelNameElements = document.querySelectorAll('.ytd-channel-name, #channel-name, [class*="channel-name"]');
    for (const channelElement of channelNameElements) {
      // Look for sibling or parent images
      const container = channelElement.closest('.ytd-video-owner-renderer') ||
                       channelElement.closest('#owner') ||
                       channelElement.parentElement;

      if (container) {
        const nearbyImages = container.querySelectorAll('img');
        for (const img of nearbyImages) {
          if (img.src && !img.src.includes('favicon') && !img.src.includes('default-avatar')) {
            console.log('Multi-Platform Chat Monitor: Found YouTube avatar near channel name:', img.src.substring(0, 100) + '...');
            return img.src;
          }
        }
      }
    }

    console.log('Multi-Platform Chat Monitor: No suitable YouTube avatar found');
    return null;
  }

  getKickAvatar() {
    // Try to find Kick channel avatar
    const kickSelectors = [
      '#channel-avatar',
      '.channel-avatar img',
      '.profile-avatar img',
      '.streamer-avatar img',
      'img[id="channel-avatar"]',
      '[class*="avatar"] img',
      'img[alt*="Destiny"]', // Fallback for specific channels
      'img[alt*="'+this.getChannelName()+'"]'
    ];

    for (const selector of kickSelectors) {
      const img = document.querySelector(selector);
      if (img && img.src && img.src.includes('files.kick.com')) {
        console.log('Multi-Platform Chat Monitor: Found Kick avatar with selector:', selector);
        return img.src;
      }
    }

    return null;
  }

  recordMessage(username = null) {
    const now = Date.now();

    // Simple deduplication: don't record the same message within 100ms
    if (this.lastMessageTime && (now - this.lastMessageTime) < 100) {
      console.log(`Multi-Platform Chat Monitor: Skipping duplicate message within 100ms`);
      return;
    }
    this.lastMessageTime = now;

    this.messageTimestamps.push(now);
    this.totalMessages++;

    // Extract and track unique chatters
    if (username && username.trim().length > 0) {
      this.uniqueChatters.add(username.trim());
      console.log(`Multi-Platform Chat Monitor: Recorded message from ${this.currentPlatform} user: ${username}, unique chatters: ${this.uniqueChatters.size}`);
    } else {
      console.log(`Multi-Platform Chat Monitor: Recorded message without username from ${this.currentPlatform}`);
    }

    // Clean old timestamps (keep only last timeWindow seconds)
    const cutoffTime = now - (this.timeWindow * 1000);
    this.messageTimestamps = this.messageTimestamps.filter(timestamp => timestamp > cutoffTime);

    // Calculate rates
    this.calculateActivityRates();

    // Update overlay
    this.updateOverlay();
  }

  calculateActivityRates() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneSecondAgo = now - 1000;

    // Messages in last minute - this gives us messages per minute rate
    const messagesLastMinute = this.messageTimestamps.filter(timestamp => timestamp > oneMinuteAgo).length;
    this.messagesPerMinute = messagesLastMinute;

    // Messages in last second - calculate actual rate per second with decimals
    const messagesLastSecond = this.messageTimestamps.filter(timestamp => timestamp > oneSecondAgo).length;
    // Calculate rate: messages per second = messages in last second
    this.messagesPerSecond = messagesLastSecond;

    // Update unique chatters count
    this.sessionData.uniqueChatters = this.uniqueChatters.size;
  }

  async createActivityOverlay() {
    // Get channel name from URL
    const channelName = this.getChannelName();

    // Load saved settings and position
    await this.loadSettings();

    // Create the overlay element
    this.overlay = document.createElement('div');
    this.overlay.id = 'twitch-chat-monitor-overlay';

    // For initial load, we'll set a placeholder and update it after page loads
    const thumbnailUrl = this.getChannelThumbnail(channelName);

    // Create overlay structure safely using DOM methods
    this.overlay.innerHTML = ''; // Clear any existing content

    const container = document.createElement('div');
    container.className = 'monitor-container';

    const header = document.createElement('div');
    header.className = 'monitor-header';

    // Safely create thumbnail image
    const thumbnail = document.createElement('img');
    thumbnail.className = 'channel-thumbnail';
    thumbnail.src = this.sanitizeUrl(thumbnailUrl);
    thumbnail.alt = this.sanitizeText(channelName) + ' thumbnail';
    thumbnail.onerror = function() { this.style.display = 'none'; };
    header.appendChild(thumbnail);

    // Safely create channel name
    const channelNameSpan = document.createElement('span');
    channelNameSpan.className = 'channel-name';
    channelNameSpan.textContent = this.sanitizeText(channelName);
    header.appendChild(channelNameSpan);

    // Create header actions
    const headerActions = document.createElement('div');
    headerActions.className = 'header-actions';

    const historyButton = document.createElement('button');
    historyButton.className = 'history-button';
    historyButton.id = 'history-button';
    historyButton.title = 'Download Chat History CSV';
    historyButton.textContent = '💾';
    headerActions.appendChild(historyButton);

    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.id = 'close-button';
    closeButton.title = 'Close Extension';
    closeButton.textContent = '×';
    headerActions.appendChild(closeButton);

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '⋮⋮';
    headerActions.appendChild(dragHandle);

    header.appendChild(headerActions);
    container.appendChild(header);

    // Create stats section
    const stats = document.createElement('div');
    stats.className = 'monitor-stats';

    // MPM stat
    const mpmStat = document.createElement('div');
    mpmStat.className = 'stat';
    const mpmValue = document.createElement('span');
    mpmValue.className = 'value';
    mpmValue.id = 'mpm-value';
    mpmValue.textContent = '0';
    const mpmUnit = document.createElement('span');
    mpmUnit.className = 'unit';
    mpmUnit.textContent = 'msg/min';
    mpmStat.appendChild(mpmValue);
    mpmStat.appendChild(mpmUnit);
    stats.appendChild(mpmStat);

    // MPS stat
    const mpsStat = document.createElement('div');
    mpsStat.className = 'stat';
    const mpsValue = document.createElement('span');
    mpsValue.className = 'value';
    mpsValue.id = 'mps-value';
    mpsValue.textContent = '0';
    const mpsUnit = document.createElement('span');
    mpsUnit.className = 'unit';
    mpsUnit.textContent = 'msg/sec';
    mpsStat.appendChild(mpsValue);
    mpsStat.appendChild(mpsUnit);
    stats.appendChild(mpsStat);

    // Unique stat
    const uniqueStat = document.createElement('div');
    uniqueStat.className = 'stat';
    const uniqueValue = document.createElement('span');
    uniqueValue.className = 'value';
    uniqueValue.id = 'unique-value';
    uniqueValue.textContent = '0';
    const uniqueUnit = document.createElement('span');
    uniqueUnit.className = 'unit';
    uniqueUnit.textContent = 'unique';
    uniqueStat.appendChild(uniqueValue);
    uniqueStat.appendChild(uniqueUnit);
    stats.appendChild(uniqueStat);

    // Timer display
    const timerDisplay = document.createElement('div');
    timerDisplay.className = 'timer-display';
    const timerValue = document.createElement('span');
    timerValue.className = 'timer-value';
    timerValue.id = 'timer-value';
    timerValue.textContent = '00:00:00';
    timerDisplay.appendChild(timerValue);
    stats.appendChild(timerDisplay);

    container.appendChild(stats);
    this.overlay.appendChild(container);

    // Make overlay draggable
    this.makeDraggable();

    // Add drag event listeners after overlay is added to DOM
    setTimeout(() => {
      this.setupDragListeners();
      this.setupHistoryButton();
      this.setupCloseButton();
    }, 100);

    // Style the overlay based on platform
    let baseStyles = '';
    let borderColor = '';

    switch (this.currentPlatform) {
      case 'twitch':
        baseStyles = `
          position: fixed;
          z-index: 10000;
          background: rgba(0, 0, 0, 0.8);
          color: #9146ff;
          padding: 10px 15px;
          border-radius: 8px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
        `;
        borderColor = 'rgba(255, 255, 255, 0.1)';
        break;

      case 'youtube':
        baseStyles = `
          position: fixed;
          z-index: 10000;
          background: rgba(0, 0, 0, 0.8);
          color: #ff0000;
          padding: 10px 15px;
          border-radius: 8px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
        `;
        borderColor = 'rgba(255, 255, 255, 0.1)';
        break;

      case 'kick':
        baseStyles = `
          position: fixed;
          z-index: 10000;
          background: rgba(0, 0, 0, 0.8);
          color: #00ff00;
          padding: 10px 15px;
          border-radius: 8px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
        `;
        borderColor = 'rgba(255, 255, 255, 0.1)';
        break;

      default:
        baseStyles = `
          position: fixed;
          z-index: 10000;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 10px 15px;
          border-radius: 8px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
        `;
        borderColor = 'rgba(255, 255, 255, 0.1)';
    }

    // Apply platform attribute for CSS theming
    this.overlay.setAttribute('data-platform', this.currentPlatform || 'unknown');

    // Apply saved position or default position
    let positionStyles = '';
    if (this.savedPosition) {
      positionStyles = `left: ${this.savedPosition.left}px; top: ${this.savedPosition.top}px; right: auto;`;
    } else {
      // Default position based on settings
      switch (this.settings.position) {
        case 'top-left':
          positionStyles = 'top: 20px; left: 20px; right: auto;';
          break;
        case 'bottom-right':
          positionStyles = 'bottom: 20px; right: 20px; top: auto; left: auto;';
          break;
        case 'bottom-left':
          positionStyles = 'bottom: 20px; left: 20px; top: auto; right: auto;';
          break;
        default: // top-right
          positionStyles = 'top: 20px; right: 20px; left: auto;';
      }
    }

    this.overlay.style.cssText = baseStyles + positionStyles;

    // Add to page
    document.body.appendChild(this.overlay);
    console.log('Twitch Chat Monitor: Activity overlay created');
  }

  updateOverlay() {
    if (!this.overlay) return;

    const mpmElement = this.overlay.querySelector('#mpm-value');
    const mpsElement = this.overlay.querySelector('#mps-value');
    const uniqueElement = this.overlay.querySelector('#unique-value');

    // Format MPM: show whole numbers only
    if (mpmElement) {
      const mpmValue = this.messagesPerMinute;
      mpmElement.textContent = Math.round(mpmValue);
    }

    // Format MPS: show whole numbers only
    if (mpsElement) {
      const mpsValue = this.messagesPerSecond;
      mpsElement.textContent = Math.round(mpsValue);
    }

    // Display unique chatters
    if (uniqueElement) {
      uniqueElement.textContent = this.uniqueChatters.size;
    }
  }

  applySettingsToOverlay() {
    if (!this.overlay) return;

    // Apply theme
    this.applyTheme();

    // Apply visibility based on enabled setting
    if (!this.settings.enabled) {
      this.overlay.style.display = 'none';
    } else {
      this.overlay.style.display = 'block';
    }

    // Apply position (if not using saved position)
    if (!this.savedPosition) {
      switch (this.settings.position) {
        case 'top-left':
          this.overlay.style.top = '20px';
          this.overlay.style.left = '20px';
          this.overlay.style.right = 'auto';
          this.overlay.style.bottom = 'auto';
          break;
        case 'bottom-right':
          this.overlay.style.bottom = '20px';
          this.overlay.style.right = '20px';
          this.overlay.style.top = 'auto';
          this.overlay.style.left = 'auto';
          break;
        case 'bottom-left':
          this.overlay.style.bottom = '20px';
          this.overlay.style.left = '20px';
          this.overlay.style.top = 'auto';
          this.overlay.style.right = 'auto';
          break;
        default: // top-right
          this.overlay.style.top = '20px';
          this.overlay.style.right = '20px';
          this.overlay.style.left = 'auto';
          this.overlay.style.bottom = 'auto';
      }
    }

    console.log('Twitch Chat Monitor: Settings applied to overlay', this.settings);
  }

  applyTheme() {
    if (!this.overlay) return;

    const theme = this.settings.theme;

    if (theme === 'light') {
      this.overlay.style.background = 'rgba(255, 255, 255, 0.9)';
      this.overlay.style.color = '#1a1a1a';
      this.overlay.style.borderColor = 'rgba(0, 0, 0, 0.1)';
    } else if (theme === 'auto') {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (!prefersDark) {
        this.overlay.style.background = 'rgba(255, 255, 255, 0.9)';
        this.overlay.style.color = '#1a1a1a';
        this.overlay.style.borderColor = 'rgba(0, 0, 0, 0.1)';
      } else {
        this.overlay.style.background = 'rgba(0, 0, 0, 0.8)';
        this.overlay.style.color = 'white';
        this.overlay.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      }
    } else {
      // Dark theme (default)
      this.overlay.style.background = 'rgba(0, 0, 0, 0.8)';
      this.overlay.style.color = 'white';
      this.overlay.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    }

    this.overlay.setAttribute('data-theme', theme);
  }

  setupSettingsListener() {
    // Listen for settings changes from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SETTINGS_UPDATED' && message.settings) {
        console.log('Multi-Platform Chat Monitor: Settings updated from popup', message.settings);

        // Update local settings
        this.settings = { ...this.settings, ...message.settings };

        // Check if extension was re-enabled
        if (message.settings.enabled && !this.isInitialized && this.isValidLivestreamPage()) {
          console.log('Multi-Platform Chat Monitor: Extension re-enabled, reinitializing...');
          this.init();
        } else {
          // Apply changes immediately
          this.applySettingsToOverlay();
        }

        sendResponse({ success: true });
        return true;
      }
    });

    console.log('Multi-Platform Chat Monitor: Settings listener initialized');
  }

  setupURLMonitoring() {
    // Monitor for URL changes within the same page (SPA navigation)
    let currentUrl = window.location.href;

    const checkURLChange = () => {
      const newUrl = window.location.href;
      if (newUrl !== currentUrl) {
        console.log('Multi-Platform Chat Monitor: URL changed from', currentUrl, 'to', newUrl);
        currentUrl = newUrl;

        // Check if this is still a valid livestream page
        if (this.isValidLivestreamPage()) {
          // Handle channel change
          this.handleChannelChange();
        } else {
          // Not a livestream page anymore
          this.handleChannelExit();
        }
      }
    };

    // Use MutationObserver on the document to detect navigation changes
    this.urlObserver = new MutationObserver(() => {
      // Debounce the URL check to avoid excessive calls
      clearTimeout(this.urlCheckTimeout);
      this.urlCheckTimeout = setTimeout(checkURLChange, 100);
    });

    this.urlObserver.observe(document, {
      childList: true,
      subtree: true
    });

    // Also listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', () => {
      setTimeout(checkURLChange, 100);
    });

    // Check for Twitch's navigation method (they might use custom events)
    document.addEventListener('twitch-navigate', () => {
      setTimeout(checkURLChange, 100);
    });

    // Enhanced YouTube navigation detection
    if (this.currentPlatform === 'youtube') {
      // YouTube-specific navigation events
      document.addEventListener('yt-navigate', () => {
        setTimeout(checkURLChange, 200);
      });

      // YouTube page data updates
      document.addEventListener('yt-page-data-updated', () => {
        setTimeout(checkURLChange, 200);
      });

      // Monitor for YouTube's appbar changes (indicates navigation)
      const appbarObserver = new MutationObserver(() => {
        setTimeout(() => {
          const newUrl = window.location.href;
          if (newUrl !== currentUrl) {
            console.log('Multi-Platform Chat Monitor: YouTube appbar navigation detected');
            checkURLChange();
          }
        }, 500);
      });

      // Try to observe YouTube's appbar
      const appbar = document.querySelector('#masthead, #header, .ytd-masthead');
      if (appbar) {
        appbarObserver.observe(appbar, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class']
        });
      }

      // Periodic URL check for YouTube (fallback)
      setInterval(() => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrl && this.isValidLivestreamPage()) {
          console.log('Multi-Platform Chat Monitor: YouTube periodic URL check detected change');
          checkURLChange();
        }
      }, 2000); // Check every 2 seconds

      // Additional fallback: Check if extension should be showing but isn't
      setInterval(() => {
        if (this.isValidLivestreamPage() && !this.overlay && !this.isInitialized) {
          console.log('Multi-Platform Chat Monitor: YouTube fallback detected - extension should be active but isn\'t, reinitializing...');
          this.init();
        }
      }, 3000); // Check every 3 seconds

      // Listen for YouTube's player state changes
      document.addEventListener('onStateChange', () => {
        setTimeout(checkURLChange, 300);
      });

      // YouTube history API changes - override pushState and replaceState
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = function(state, title, url) {
        const result = originalPushState.apply(this, arguments);
        setTimeout(() => {
          const newUrl = window.location.href;
          if (newUrl !== currentUrl) {
            console.log('Multi-Platform Chat Monitor: YouTube history.pushState detected');
            checkURLChange();
          }
        }, 100);
        return result;
      };

      history.replaceState = function(state, title, url) {
        const result = originalReplaceState.apply(this, arguments);
        setTimeout(() => {
          const newUrl = window.location.href;
          if (newUrl !== currentUrl) {
            console.log('Multi-Platform Chat Monitor: YouTube history.replaceState detected');
            checkURLChange();
          }
        }, 100);
        return result;
      };

      // Also monitor for YouTube's navigation finish events
      document.addEventListener('yt-navigate-finish', () => {
        setTimeout(checkURLChange, 300);
      });
    }

    console.log('Multi-Platform Chat Monitor: URL monitoring initialized for platform:', this.currentPlatform);
  }

  async handleChannelChange() {
    const newChannel = this.getChannelName();

    // Only reset if it's actually a different channel
    if (newChannel !== this.currentChannel) {
      console.log('Multi-Platform Chat Monitor: Channel changed from', this.currentChannel, 'to', newChannel);

      // Save session data synchronously first to avoid context invalidation
      if (this.currentChannel) {
        try {
          // Create session data synchronously
          const sessionDuration = this.monitoringStartTime ? Date.now() - this.monitoringStartTime : 0;
          const avgMessagesPerMinute = this.sessionData.messagesPerMinute.length > 0
            ? Math.round(this.sessionData.messagesPerMinute.reduce((a, b) => a + b, 0) / this.sessionData.messagesPerMinute.length)
            : 0;
          const avgMessagesPerSecond = this.sessionData.messagesPerSecond.length > 0
            ? Math.round((this.sessionData.messagesPerSecond.reduce((a, b) => a + b, 0) / this.sessionData.messagesPerSecond.length) * 100) / 100
            : 0;
          const avgViewers = this.sessionData.viewerCounts.length > 0
            ? Math.round(this.sessionData.viewerCounts.reduce((a, b) => a + b, 0) / this.sessionData.viewerCounts.length)
            : 0;

          const sessionEntry = {
            channelName: this.currentChannel,
            channelAvatar: this.getChannelThumbnail(this.currentChannel),
            avgMessagesPerMinute,
            avgMessagesPerSecond,
            sessionDuration,
            avgViewers,
            totalMessages: this.sessionData.totalMessages,
            uniqueChatters: this.sessionData.uniqueChatters,
            platform: this.currentPlatform,
            timestamp: Date.now(),
            formattedDate: new Date().toLocaleString()
          };

          // Try to save synchronously if possible, but don't block the channel switch
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get('chatHistory').then(result => {
              const history = result.chatHistory || [];
              history.push(sessionEntry);
              if (history.length > 100) {
                history.splice(0, history.length - 100);
              }
              chrome.storage.local.set({ 'chatHistory': history }).then(() => {
                console.log('Multi-Platform Chat Monitor: Session data saved before channel switch');
              }).catch(err => {
                console.warn('Multi-Platform Chat Monitor: Could not save session data before channel switch:', err.message);
              });
            }).catch(err => {
              console.warn('Multi-Platform Chat Monitor: Could not load history before channel switch:', err.message);
            });
          }
        } catch (error) {
          console.warn('Multi-Platform Chat Monitor: Error saving session data before channel switch:', error.message);
        }
      }

      // Disconnect old observer to prevent conflicts
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
        console.log('Multi-Platform Chat Monitor: Disconnected old chat observer');
      }

      // Reset activity data
      this.resetActivityData();

      // Update current channel
      this.currentChannel = newChannel;
      this.sessionData.platform = this.detectPlatform(); // Update platform in case it changed

      // Update overlay with new channel name and thumbnail
      if (this.overlay) {
        const channelElement = this.overlay.querySelector('.channel-name');
        if (channelElement) {
          channelElement.textContent = newChannel;
        }

        const thumbnailElement = this.overlay.querySelector('.channel-thumbnail');
        if (thumbnailElement) {
          // Wait a bit for the new page to load before getting the avatar
          setTimeout(() => {
            const newThumbnailUrl = this.getChannelThumbnail(newChannel);
            thumbnailElement.src = newThumbnailUrl;
            thumbnailElement.alt = `${newChannel} thumbnail`;
            thumbnailElement.style.display = 'block'; // Show in case it was hidden due to error
          }, 1000); // Wait 1 second for page to load
        }
      }

      // Wait a bit for the new channel page to load, then setup new chat observer
      const setupDelay = this.currentPlatform === 'youtube' ? 3000 : 2000;
      setTimeout(() => {
        this.setupChatObserver();
        console.log('Multi-Platform Chat Monitor: Successfully switched to new channel:', newChannel);
      }, setupDelay); // Wait longer for YouTube

      // Update display immediately
      this.updateOverlay();
    }
  }

  async handleChannelExit() {
    console.log('Multi-Platform Chat Monitor: Exited channel page');

    // Save session data before leaving (with error handling)
    try {
      if (this.currentChannel && this.monitoringStartTime) {
        // Try to save synchronously first
        const sessionDuration = Date.now() - this.monitoringStartTime;
        const avgMessagesPerMinute = this.sessionData.messagesPerMinute.length > 0
          ? Math.round(this.sessionData.messagesPerMinute.reduce((a, b) => a + b, 0) / this.sessionData.messagesPerMinute.length)
          : 0;
        const avgMessagesPerSecond = this.sessionData.messagesPerSecond.length > 0
          ? Math.round((this.sessionData.messagesPerSecond.reduce((a, b) => a + b, 0) / this.sessionData.messagesPerSecond.length) * 100) / 100
          : 0;
        const avgViewers = this.sessionData.viewerCounts.length > 0
          ? Math.round(this.sessionData.viewerCounts.reduce((a, b) => a + b, 0) / this.sessionData.viewerCounts.length)
          : 0;

        const sessionEntry = {
          channelName: this.currentChannel,
          channelAvatar: this.getChannelThumbnail(this.currentChannel),
          avgMessagesPerMinute,
          avgMessagesPerSecond,
          sessionDuration,
          avgViewers,
          totalMessages: this.sessionData.totalMessages,
          uniqueChatters: this.sessionData.uniqueChatters,
          platform: this.currentPlatform,
          timestamp: Date.now(),
          formattedDate: new Date().toLocaleString()
        };

        // Try to save, but don't wait for it
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.get('chatHistory').then(result => {
            const history = result.chatHistory || [];
            history.push(sessionEntry);
            if (history.length > 100) {
              history.splice(0, history.length - 100);
            }
            return chrome.storage.local.set({ 'chatHistory': history });
          }).then(() => {
            console.log('Multi-Platform Chat Monitor: Session data saved on exit');
          }).catch(err => {
            console.warn('Multi-Platform Chat Monitor: Could not save session data on exit:', err.message);
          });
        }
      }
    } catch (error) {
      console.warn('Multi-Platform Chat Monitor: Error saving session data on exit:', error.message);
    }

    this.currentChannel = null;

    // Hide overlay
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }

    // Disconnect observers
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clear timers
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Mark as disabled
    this.isInitialized = false;
  }

  resetActivityData() {
    this.messagesPerMinute = 0;
    this.messagesPerSecond = 0;
    this.totalMessages = 0;
    this.messageTimestamps = [];
    this.uniqueChatters.clear();
    this.lastMessageTime = null; // Reset duplicate prevention

    // Reset session data
    this.sessionData = {
      messagesPerMinute: [],
      messagesPerSecond: [],
      viewerCounts: [],
      uniqueChatters: 0,
      totalMessages: 0
    };

    // Reset timer
    this.resetTimer();

    console.log('Twitch Chat Monitor: Activity data reset');
  }

  resetTimer() {
    this.monitoringStartTime = Date.now();

    // Clear existing timer interval
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Start new timer update interval
    this.timerInterval = setInterval(() => {
      this.updateTimer();
    }, 1000); // Update every second

    console.log('Twitch Chat Monitor: Timer reset');
  }

  updateTimer() {
    if (!this.monitoringStartTime || !this.overlay) return;

    const elapsed = Date.now() - this.monitoringStartTime;
    const formattedTime = this.formatElapsedTime(elapsed);

    const timerElement = this.overlay.querySelector('#timer-value');
    if (timerElement) {
      timerElement.textContent = formattedTime;
    }

    // Collect session data every 10 seconds
    if (elapsed % 10000 < 1000) { // Every 10 seconds
      this.collectSessionData();
    }
  }

  collectSessionData() {
    // Collect current stats for session history
    this.sessionData.messagesPerMinute.push(this.messagesPerMinute);
    this.sessionData.messagesPerSecond.push(this.messagesPerSecond);

    // Try to get viewer count
    const viewerCount = this.getViewerCount();
    if (viewerCount > 0) {
      this.sessionData.viewerCounts.push(viewerCount);
    }

    this.sessionData.totalMessages = Math.max(this.sessionData.totalMessages, this.totalMessages);
  }

  getViewerCount() {
    console.log(`Multi-Platform Chat Monitor: Getting viewer count for ${this.currentPlatform}`);

    switch (this.currentPlatform) {
      case 'twitch':
        return this.getTwitchViewerCount();
      case 'youtube':
        return this.getYouTubeViewerCount();
      case 'kick':
        return this.getKickViewerCount();
      default:
        console.log('Multi-Platform Chat Monitor: Unknown platform for viewer count');
        return 0;
    }
  }

  getTwitchViewerCount() {
    // Twitch-specific viewer count selectors
    const viewerSelectors = [
      '[data-a-target="channel-viewers-count"]',
      '[data-test-selector="stream-info-card-component__viewers-count"]',
      '.live-viewers-count',
      '.viewers-count',
      '.viewer-count',
      '.stream-info-card-component__viewers-count',
      '[class*="viewers"]',
      '[class*="viewer-count"]'
    ];

    for (const selector of viewerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent || element.innerText || '';
        console.log('Multi-Platform Chat Monitor: Twitch viewer element found with selector:', selector, 'text:', text);
        const match = text.match(/(\d+(?:,\d+)*)/);
        if (match) {
          const count = parseInt(match[1].replace(/,/g, ''));
          console.log('Multi-Platform Chat Monitor: Parsed Twitch viewer count:', count);
          return count;
        }
      }
    }

    console.log('Multi-Platform Chat Monitor: No Twitch viewer count found');
    return 0;
  }

  getYouTubeViewerCount() {
    // YouTube-specific viewer count selectors
    const viewerSelectors = [
      // Live stream viewer count - most common locations
      '.view-count',
      '[class*="view-count"]',
      '[class*="viewer-count"]',
      // Try to find elements with viewer/watching text
      'span[aria-label*="watching"]',
      'span[aria-label*="viewers"]',
      // YouTube video info section
      '.ytd-video-owner-renderer',
      '.ytd-video-meta-block',
      // Live badge and viewer count area
      '.badge-shape-wiz__text',
      '[class*="live"]',
      // More specific selectors
      'yt-formatted-string[class*="ytd-video-view-count-renderer"]',
      '.ytd-video-view-count-renderer',
      '.view-count-renderer'
    ];

    for (const selector of viewerSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent || element.innerText || '';
        console.log('Multi-Platform Chat Monitor: YouTube checking element text:', text.substring(0, 100));

        // Look for patterns like "1,234 watching" or "watching" with numbers
        const patterns = [
          /(\d+(?:,\d+)*)\s*watching/i,
          /watching\s*(\d+(?:,\d+)*)/i,
          /(\d+(?:,\d+)*)\s*viewers?/i,
          /(\d+(?:,\d+)*)\s*live/i,
          /(\d+(?:,\d+)*)\s*views?/i,  // Also check for views in case it's not live
          /(\d+(?:,\d+)*)/  // Fallback: any number in the element
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            const count = parseInt(match[1].replace(/,/g, ''));
            if (count > 0 && count < 10000000) { // Reasonable bounds for viewer count
              console.log('Multi-Platform Chat Monitor: Parsed YouTube viewer count:', count, 'from text:', text, 'using pattern:', pattern);
              return count;
            }
          }
        }
      }
    }

    // Try aria-label attributes for YouTube
    const ariaElements = document.querySelectorAll('[aria-label]');
    for (const element of ariaElements) {
      const ariaLabel = element.getAttribute('aria-label') || '';
      if (ariaLabel.includes('watching') || ariaLabel.includes('viewer') || ariaLabel.includes('live')) {
        console.log('Multi-Platform Chat Monitor: YouTube checking aria-label:', ariaLabel);
        const match = ariaLabel.match(/(\d+(?:,\d+)*)/);
        if (match && match[1]) {
          const count = parseInt(match[1].replace(/,/g, ''));
          if (count > 0 && count < 10000000) {
            console.log('Multi-Platform Chat Monitor: Parsed YouTube viewer count from aria-label:', count);
            return count;
          }
        }
      }
    }

    // Try to find iframe and check its content for viewer count
    try {
      const chatIframe = document.querySelector('#chatframe');
      if (chatIframe && chatIframe.contentDocument) {
        const iframeSelectors = [
          '.view-count',
          '[class*="view-count"]',
          '[class*="viewer"]',
          'span[aria-label*="watching"]'
        ];

        for (const selector of iframeSelectors) {
          const iframeElements = chatIframe.contentDocument.querySelectorAll(selector);
          for (const element of iframeElements) {
            const text = element.textContent || element.innerText || '';
            console.log('Multi-Platform Chat Monitor: YouTube iframe checking element text:', text);

            const patterns = [
              /(\d+(?:,\d+)*)\s*watching/i,
              /(\d+(?:,\d+)*)\s*viewers?/i,
              /(\d+(?:,\d+)*)/
            ];

            for (const pattern of patterns) {
              const match = text.match(pattern);
              if (match && match[1]) {
                const count = parseInt(match[1].replace(/,/g, ''));
                if (count > 0 && count < 10000000) {
                  console.log('Multi-Platform Chat Monitor: Parsed YouTube iframe viewer count:', count, 'from text:', text);
                  return count;
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.log('Multi-Platform Chat Monitor: Could not access YouTube iframe for viewer count:', error.message);
    }

    console.log('Multi-Platform Chat Monitor: No YouTube viewer count found');
    return 0;
  }

  getKickViewerCount() {
    // Kick-specific viewer count selectors
    const viewerSelectors = [
      '.viewers-count',
      '.viewer-count',
      '[class*="viewers"]',
      '[class*="viewer"]',
      '.live-viewers',
      '.stream-stats',
      // Try to find text containing viewer numbers
      '[class*="stats"]',
      '[class*="info"]'
    ];

    for (const selector of viewerSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent || element.innerText || '';
        console.log('Multi-Platform Chat Monitor: Kick checking element text:', text);

        const patterns = [
          /(\d+(?:,\d+)*)\s*viewers?/i,
          /(\d+(?:,\d+)*)\s*watching/i,
          /viewers?\s*(\d+(?:,\d+)*)/i,
          /watching\s*(\d+(?:,\d+)*)/i
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            const count = parseInt(match[1].replace(/,/g, ''));
            if (count > 0 && count < 10000000) {
              console.log('Multi-Platform Chat Monitor: Parsed Kick viewer count:', count, 'from text:', text);
              return count;
            }
          }
        }
      }
    }

    console.log('Multi-Platform Chat Monitor: No Kick viewer count found');
    return 0;
  }

  setupHistoryButton() {
    const historyButton = this.overlay.querySelector('#history-button');
    if (historyButton) {
      historyButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.downloadHistoryCSV();
      });
    }
  }

  async downloadHistoryCSV() {
    const historyButton = this.overlay.querySelector('#history-button');

    try {
      console.log('Multi-Platform Chat Monitor: Generating CSV download...');

      // Visual feedback - change button text temporarily
      if (historyButton) {
        historyButton.innerHTML = '⏳';
        historyButton.title = 'Generating CSV...';
        historyButton.style.pointerEvents = 'none';
      }

      // Load history data
      const result = await chrome.storage.local.get('chatHistory');
      const history = result.chatHistory || [];

      // Sort by timestamp (newest first)
      history.sort((a, b) => b.timestamp - a.timestamp);

      if (history.length === 0) {
        console.log('Multi-Platform Chat Monitor: No history data to export');

        // Reset button and show feedback
        if (historyButton) {
          historyButton.innerHTML = '📄';
          historyButton.title = 'No History Data';
          setTimeout(() => {
            historyButton.innerHTML = '💾';
            historyButton.title = 'Download Chat History CSV';
            historyButton.style.pointerEvents = 'auto';
          }, 1500);
        }
        return;
      }

      // Generate CSV content with headers and borders
      const csvContent = this.generateCSVContent(history);

      // Create and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');

      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const platform = this.currentPlatform || 'multi-platform';
        link.setAttribute('download', `chat-monitor-history-${platform}-${timestamp}.csv`);

        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('Multi-Platform Chat Monitor: CSV download initiated');

        // Success feedback
        if (historyButton) {
          historyButton.innerHTML = '✅';
          historyButton.title = 'Download Complete!';
          setTimeout(() => {
            historyButton.innerHTML = '💾';
            historyButton.title = 'Download Chat History CSV';
            historyButton.style.pointerEvents = 'auto';
          }, 2000);
        }
      } else {
        console.error('Multi-Platform Chat Monitor: Browser does not support download');

        // Error feedback
        if (historyButton) {
          historyButton.innerHTML = '❌';
          historyButton.title = 'Download Failed';
          setTimeout(() => {
            historyButton.innerHTML = '💾';
            historyButton.title = 'Download Chat History CSV';
            historyButton.style.pointerEvents = 'auto';
          }, 2000);
        }
      }

    } catch (error) {
      console.error('Multi-Platform Chat Monitor: Failed to download CSV:', error);

      // Error feedback
      if (historyButton) {
        historyButton.innerHTML = '❌';
        historyButton.title = 'Download Failed';
        setTimeout(() => {
          historyButton.innerHTML = '💾';
          historyButton.title = 'Download Chat History CSV';
          historyButton.style.pointerEvents = 'auto';
        }, 2000);
      }
    }
  }

  generateCSVContent(history) {
    // CSV headers - clean format for spreadsheet import
    let csv = '';

    // Add column headers (first row)
    csv += 'Streamer,Avg MPM,Avg MPS,Unique Chatters,Platform,Duration,Avg Viewers,Date\n';

    // Add data rows - clean CSV format
    history.forEach(session => {
      const streamer = session.channelName || 'Unknown';
      const mpm = this.formatMessageRate(session.avgMessagesPerMinute, 'mpm');
      const mps = this.formatMessageRate(session.avgMessagesPerSecond, 'mps');
      const unique = session.uniqueChatters || 0;
      const platform = this.formatPlatformName(session.platform || 'unknown');
      const duration = this.formatElapsedTime(session.sessionDuration);
      const viewers = session.avgViewers > 0 ? session.avgViewers : '';
      const date = session.formattedDate || new Date(session.timestamp).toLocaleString();

      // Escape commas and quotes in data
      const escapedStreamer = streamer.replace(/"/g, '""').replace(/,/g, ';');
      const escapedPlatform = platform.replace(/"/g, '""');
      const escapedDuration = duration.replace(/:/g, ':');
      const escapedDate = date.replace(/"/g, '""');

      csv += `"${escapedStreamer}",${mpm},${mps},${unique},"${escapedPlatform}","${escapedDuration}",${viewers},"${escapedDate}"\n`;
    });

    return csv;
  }

  formatPlatformName(platform) {
    switch (platform) {
      case 'twitch': return 'Twitch';
      case 'youtube': return 'YouTube';
      case 'kick': return 'Kick';
      default: return platform.charAt(0).toUpperCase() + platform.slice(1);
    }
  }

  sanitizeText(text) {
    // Remove HTML tags and escape special characters
    if (typeof text !== 'string') return '';
    return text.replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/&/g, '&amp;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#x27;')
               .replace(/\//g, '&#x2F;');
  }

  sanitizeUrl(url) {
    // Basic URL validation and sanitization
    if (typeof url !== 'string') return '';
    // Only allow http/https URLs
    if (!url.match(/^https?:\/\//)) return '';
    // Remove any potentially dangerous characters
    return url.replace(/[<>"']/g, '');
  }

  setupCloseButton() {
    const closeButton = this.overlay.querySelector('#close-button');
    if (closeButton) {
      closeButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeExtension();
      });
    }
  }

  closeExtension() {
    console.log('Twitch Chat Monitor: Closing extension');

    // Save session data before closing
    this.saveSessionData();

    // Hide overlay
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }

    // Hide history table if visible
    if (this.historyTableVisible) {
      this.hideHistoryTable();
    }

    // Disconnect observers
    if (this.observer) {
      this.observer.disconnect();
    }

    // Clear timers
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Mark as disabled
    this.isInitialized = false;

    // Update settings to reflect disabled state
    this.settings.enabled = false;
    chrome.storage.sync.set({ 'twitchChatMonitorSettings': this.settings });
  }

  async showHistoryTable() {
    // Create history table if it doesn't exist
    if (!this.historyTable) {
      this.createHistoryTable();
    }

    // Wait a bit for the table to be fully created in DOM
    await new Promise(resolve => setTimeout(resolve, 10));

    // Load and display history data
    await this.loadAndDisplayHistory();

    // Show the table
    this.historyTable.style.display = 'block';
    this.historyTableVisible = true;

    // Position it relative to the overlay
    this.positionHistoryTable();
  }

  createHistoryTable() {
    // Create dropdown table that extends from the overlay
    this.historyTable = document.createElement('div');
    this.historyTable.id = 'twitch-chat-history-table';
    this.historyTable.className = 'history-table-dropdown';

    // Set platform attribute for theming
    this.historyTable.setAttribute('data-platform', this.currentPlatform || 'unknown');

    // Set theme attribute to match the main overlay
    const currentTheme = this.settings.theme || 'dark';
    this.historyTable.setAttribute('data-theme', currentTheme);
    this.historyTable.innerHTML = `
      <div class="history-table-header">
        <span class="history-table-title">Chat History</span>
        <button class="history-table-close" id="history-table-close">&times;</button>
      </div>
      <div class="history-table-content">
        <table id="history-table">
          <thead>
            <tr>
              <th>Streamer</th>
              <th>Avg MPM</th>
              <th>Avg MPS</th>
              <th>Unique</th>
              <th>Platform</th>
              <th>Duration</th>
              <th>Avg Viewers</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody id="history-table-body">
            <tr>
              <td colspan="8" class="no-data">No chat history available</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    document.body.appendChild(this.historyTable);

    // Add close button functionality
    const closeButton = this.historyTable.querySelector('#history-table-close');
    closeButton.addEventListener('click', () => this.hideHistoryTable());

    // Add click outside to close
    document.addEventListener('click', (e) => {
      if (this.historyTableVisible &&
          !this.historyTable.contains(e.target) &&
          !this.overlay.contains(e.target)) {
        this.hideHistoryTable();
      }
    });

    // Position the table relative to the overlay
    this.positionHistoryTable();
  }

  hideHistoryTable() {
    if (this.historyTable) {
      this.historyTable.style.display = 'none';
      this.historyTableVisible = false;
    }
  }

  positionHistoryTable() {
    if (!this.overlay || !this.historyTable) return;

    const overlayRect = this.overlay.getBoundingClientRect();

    // Position the table below the overlay, aligned with the left edge
    const left = overlayRect.left;
    const top = overlayRect.bottom + 5; // 5px gap below overlay

    // Ensure table doesn't go off-screen to the right
    const maxWidth = window.innerWidth - left - 20; // 20px margin from right edge
    const tableWidth = Math.min(600, maxWidth); // Max width of 600px

    this.historyTable.style.cssText = `
      position: fixed;
      left: ${left}px;
      top: ${top}px;
      width: ${tableWidth}px;
      z-index: 10001;
      display: ${this.historyTableVisible ? 'block' : 'none'};
    `;

    // Apply current theme to the table
    this.historyTable.setAttribute('data-theme', this.settings.theme);
  }

  async saveSessionData() {
    if (!this.currentChannel || !this.monitoringStartTime) return;

    try {
      // Calculate final session statistics
      const sessionDuration = Date.now() - this.monitoringStartTime;
      const avgMessagesPerMinute = this.sessionData.messagesPerMinute.length > 0
        ? Math.round(this.sessionData.messagesPerMinute.reduce((a, b) => a + b, 0) / this.sessionData.messagesPerMinute.length)
        : 0;
      const avgMessagesPerSecond = this.sessionData.messagesPerSecond.length > 0
        ? Math.round((this.sessionData.messagesPerSecond.reduce((a, b) => a + b, 0) / this.sessionData.messagesPerSecond.length) * 100) / 100
        : 0;
      const avgViewers = this.sessionData.viewerCounts.length > 0
        ? Math.round(this.sessionData.viewerCounts.reduce((a, b) => a + b, 0) / this.sessionData.viewerCounts.length)
        : 0;

      // Create session entry
      const sessionEntry = {
        channelName: this.currentChannel,
        channelAvatar: this.getChannelThumbnail(this.currentChannel),
        avgMessagesPerMinute,
        avgMessagesPerSecond,
        sessionDuration,
        avgViewers,
        totalMessages: this.sessionData.totalMessages,
        uniqueChatters: this.sessionData.uniqueChatters,
        platform: this.currentPlatform,
        timestamp: Date.now(),
        formattedDate: new Date().toLocaleString()
      };

      // Check if we still have a valid extension context
      if (!chrome.storage || !chrome.storage.local) {
        console.warn('Multi-Platform Chat Monitor: Extension context invalidated, skipping session save');
        return;
      }

      // Save to storage with timeout
      const savePromise = chrome.storage.local.get('chatHistory').then(result => {
        const history = result.chatHistory || [];
        history.push(sessionEntry);

        // Keep only last 100 entries
        if (history.length > 100) {
          history.splice(0, history.length - 100);
        }

        return chrome.storage.local.set({ 'chatHistory': history });
      });

      // Add a timeout to the save operation
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Save timeout')), 5000);
      });

      await Promise.race([savePromise, timeoutPromise]);
      console.log('Multi-Platform Chat Monitor: Session data saved', sessionEntry);

    } catch (error) {
      if (error.message === 'Save timeout') {
        console.warn('Multi-Platform Chat Monitor: Session save timed out, extension context may be invalid');
      } else {
        console.error('Multi-Platform Chat Monitor: Failed to save session data:', error);
      }
    }
  }

  async loadAndDisplayHistory() {
    try {
      const result = await chrome.storage.local.get('chatHistory');
      const history = result.chatHistory || [];

      // Sort by timestamp (newest first)
      history.sort((a, b) => b.timestamp - a.timestamp);

      this.displayHistoryTable(history);
    } catch (error) {
      console.error('Twitch Chat Monitor: Failed to load history:', error);
      // Only try to display empty table if historyTable exists
      if (this.historyTable) {
        this.displayHistoryTable([]);
      }
    }
  }

  displayHistoryTable(history) {
    // Check if history table exists
    if (!this.historyTable) {
      console.warn('Twitch Chat Monitor: History table not found, cannot display data');
      return;
    }

    const tbody = this.historyTable.querySelector('#history-table-body');

    // Clear existing content safely
    tbody.innerHTML = '';

    if (history.length === 0) {
      // Create no-data row safely
      const noDataRow = document.createElement('tr');
      const noDataCell = document.createElement('td');
      noDataCell.colSpan = 8;
      noDataCell.className = 'no-data';
      noDataCell.textContent = 'No chat history available';
      noDataRow.appendChild(noDataCell);
      tbody.appendChild(noDataRow);
      return;
    }

    // Create table rows safely using DOM methods
    history.forEach(session => {
      const row = document.createElement('tr');

      // Streamer cell
      const streamerCell = document.createElement('td');
      streamerCell.className = 'streamer-cell';

      const streamerImg = document.createElement('img');
      streamerImg.src = this.sanitizeUrl(session.channelAvatar);
      streamerImg.alt = this.sanitizeText(session.channelName);
      streamerImg.className = 'history-avatar';
      streamerImg.onerror = function() { this.style.display = 'none'; };
      streamerCell.appendChild(streamerImg);

      const streamerSpan = document.createElement('span');
      streamerSpan.textContent = this.sanitizeText(session.channelName);
      streamerCell.appendChild(streamerSpan);

      row.appendChild(streamerCell);

      // MPM cell
      const mpmCell = document.createElement('td');
      mpmCell.textContent = this.formatMessageRate(session.avgMessagesPerMinute, 'mpm');
      row.appendChild(mpmCell);

      // MPS cell
      const mpsCell = document.createElement('td');
      mpsCell.textContent = this.formatMessageRate(session.avgMessagesPerSecond, 'mps');
      row.appendChild(mpsCell);

      // Unique chatters cell
      const uniqueCell = document.createElement('td');
      uniqueCell.textContent = session.uniqueChatters || 0;
      row.appendChild(uniqueCell);

      // Platform cell
      const platformCell = document.createElement('td');
      const platformBadge = document.createElement('span');
      platformBadge.className = `platform-badge platform-${session.platform || 'unknown'}`;
      platformBadge.textContent = this.formatPlatformName(session.platform || 'unknown');
      platformCell.appendChild(platformBadge);
      row.appendChild(platformCell);

      // Duration cell
      const durationCell = document.createElement('td');
      durationCell.textContent = this.formatElapsedTime(session.sessionDuration);
      row.appendChild(durationCell);

      // Viewers cell
      const viewersCell = document.createElement('td');
      viewersCell.textContent = session.avgViewers > 0 ? session.avgViewers.toLocaleString() : 'N/A';
      row.appendChild(viewersCell);

      // Date cell
      const dateCell = document.createElement('td');
      dateCell.textContent = session.formattedDate;
      row.appendChild(dateCell);

      tbody.appendChild(row);
    });
  }

  formatMessageRate(rate, type = 'mpm') {
    // Format message rate: MPM shows decimals if < 1, MPS shows whole numbers only
    if (type === 'mps') {
      return Math.round(rate);
    } else {
      // MPM: show decimals if < 1, whole number otherwise
      return rate < 1 ? rate.toFixed(2) : Math.round(rate);
    }
  }

  formatPlatformName(platform) {
    switch (platform) {
      case 'twitch': return 'Twitch';
      case 'youtube': return 'YouTube';
      case 'kick': return 'Kick';
      default: return 'Unknown';
    }
  }

  formatElapsedTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  makeDraggable() {
    // Remove cursor from entire overlay, only apply to drag handle
    this.overlay.style.cursor = 'default';
    this.overlay.style.userSelect = 'none';

    // Prevent text selection while dragging
    this.overlay.addEventListener('selectstart', (e) => e.preventDefault());
  }

  setupDragListeners() {
    if (!this.overlay) return;

    const dragHandle = this.overlay.querySelector('.drag-handle');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    const handleMouseDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.overlay.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      // Add dragging class for visual feedback
      this.overlay.classList.add('dragging');

      // Prevent default to avoid text selection
      e.preventDefault();
      e.stopPropagation();
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;

      // Constrain to viewport bounds
      const rect = this.overlay.getBoundingClientRect();
      const maxLeft = window.innerWidth - rect.width;
      const maxTop = window.innerHeight - rect.height;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      this.overlay.style.left = newLeft + 'px';
      this.overlay.style.top = newTop + 'px';
      this.overlay.style.right = 'auto'; // Clear any right positioning
    };

    const handleMouseUp = async () => {
      if (isDragging) {
        isDragging = false;
        this.overlay.classList.remove('dragging');

        // Save position to local storage
        const rect = this.overlay.getBoundingClientRect();
        const position = { left: rect.left, top: rect.top };

        try {
          const positionKey = `overlayPosition_${window.location.hostname}`;
          await chrome.storage.local.set({ [positionKey]: position });
          this.savedPosition = position;
          console.log('Twitch Chat Monitor: Position saved', position);
        } catch (error) {
          console.error('Twitch Chat Monitor: Failed to save position:', error);
        }
      }
    };

    // Add event listeners
    if (dragHandle) {
      dragHandle.addEventListener('mousedown', handleMouseDown);
      dragHandle.style.cursor = 'grab';
    } else {
      // Fallback: make entire header draggable
      const header = this.overlay.querySelector('.monitor-header');
      if (header) {
        header.addEventListener('mousedown', handleMouseDown);
        header.style.cursor = 'grab';
      }
    }

    // Global mouse events for drag handling
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    console.log('Twitch Chat Monitor: Drag functionality initialized');
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.urlObserver) {
      this.urlObserver.disconnect();
    }
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.isInitialized = false;
  }
}

// Initialize the monitor when the page loads
let chatMonitor = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

function initializeExtension() {
  // Small delay to ensure Twitch has loaded
  setTimeout(() => {
    chatMonitor = new TwitchChatMonitor();
  }, 2000);
}

// Clean up when page unloads
window.addEventListener('beforeunload', () => {
  if (chatMonitor) {
    chatMonitor.destroy();
  }
});

// Export for potential debugging
window.TwitchChatMonitor = TwitchChatMonitor;
