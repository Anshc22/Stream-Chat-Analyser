# Stream Chat Analyser

A Chrome extension that monitors real-time chat activity on **Twitch.tv, YouTube, and Kick.com** livestreams, displaying messages per minute/second directly in the chat window with platform-specific theming.

## Features

- **Multi-Platform Support**: Works on Twitch.tv, YouTube, and Kick.com livestreams
- **Platform-Specific Theming**: Color schemes match each platform's branding (Twitch purple, YouTube red, Kick green)
- **Real-time Activity Monitoring**: Tracks chat messages and calculates messages per minute/second
- **Visual Activity Indicator**: Displays a floating overlay showing current chat activity
- **Channel Name Display**: Shows the current streamer/channel name in the overlay
- **Streamer Avatar**: Displays the streamer's profile image/logo for each platform
- **Dynamic Channel Switching**: Automatically detects and adapts when switching channels within the same platform
- **Cross-Platform History**: Tracks and displays history across all supported platforms
- **Monitoring Timer**: Shows elapsed time since monitoring started in HH:MM:SS format
- **Chat History**: View detailed statistics from past viewing sessions in a tabulated format with platform indicators
- **Draggable Interface**: Users can drag the overlay to any position on screen
- **Selective Activation**: Only activates on valid livestream pages for supported platforms
- **Customizable Settings**: Configure overlay position, theme, and display preferences
- **Persistent Positioning**: Overlay remembers its last dragged position across browser sessions
- **Real-time Settings**: All settings changes apply immediately without requiring a save action
- **Performance Optimized**: Minimal impact on page performance (< 5% CPU, < 50MB memory)

## Installation

### From Chrome Webstore

https://chromewebstore.google.com/detail/twitch-youtube-kick-chat/ahpkkbbonbehfpcbpgnpoanckakgogek?authuser=0&hl=en-GB

### For Development
1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select this project folder
5. The extension will be loaded and ready to use

### For Users
This extension will be available on the Chrome Web Store (coming soon).

## Usage

1. **Automatic Activation**: The extension automatically activates when you visit any Twitch channel page
2. **Activity Display**: A small overlay appears in the chat window showing:
   - Streamer's avatar and channel name
   - Messages per minute (MPM)
   - Messages per second (MPS)
   - Elapsed monitoring time (HH:MM:SS)
3. **Channel Switching**: When you click different channels within Twitch, the extension automatically:
   - Updates the channel name in the overlay
   - Resets activity counters for the new channel
   - Maintains your preferred overlay position
4. **Drag to Reposition**: Click and drag the ⋮⋮ handle to move the overlay anywhere on screen
5. **Persistent Position**: The overlay will remember its position across browser sessions
6. **Chat History**: Click the 📊 button to view detailed statistics from past sessions
7. **Real-time Settings**: Changes in the settings panel apply immediately - no save button needed
8. **Settings**: Click the extension icon in the toolbar to access settings
9. **Customization**: Configure overlay position, theme, and other preferences
10. **CSV Export**: Click the 💾 button to download your chat history as a clean CSV file for spreadsheet analysis

## Settings

Access settings by clicking the extension icon in your Chrome toolbar:

- **Enable Extension**: Toggle the extension on/off (applies immediately)
- **Overlay Position**: Choose from Top Right, Top Left, Bottom Right, Bottom Left (applies immediately)
- **Theme**: Select Dark, Light, or Auto theme (applies immediately)

**Note**: All settings changes apply immediately without requiring you to click a save button. The overlay will update in real-time as you change settings.

## Chat History

The extension automatically saves detailed statistics from each viewing session. Access your chat history by clicking the 📊 button in the overlay.

### History Table Columns:
- **Streamer**: Channel name and avatar
- **Avg MPM**: Average messages per minute during the session
- **Avg MPS**: Average messages per second during the session
- **Duration**: Total time spent watching (HH:MM:SS format)
- **Avg Viewers**: Average viewer count during the session
- **Date**: When the session occurred

### Features:
- **Automatic Saving**: Sessions are saved when switching channels or leaving pages
- **Multiple Visits**: Each visit to the same channel creates a separate entry
- **Persistent Storage**: History is stored locally and persists across browser sessions
- **Cross-Platform**: Tracks sessions across Twitch, YouTube, and Kick.com
- **CSV Export**: Clean spreadsheet-ready export with proper headers

### CSV Export Format:
The exported CSV file includes:
- **Streamer**: Channel name
- **Avg MPM**: Average messages per minute
- **Avg MPS**: Average messages per second
- **Unique Chatters**: Number of unique chat participants
- **Platform**: Twitch/YouTube/Kick indicator
- **Duration**: Session length (HH:MM:SS)
- **Avg Viewers**: Average viewer count
- **Date**: Session timestamp

**Note**: All data collection happens locally in your browser and is never transmitted anywhere.

## Supported Platforms & URLs

The extension automatically detects and adapts to different streaming platforms:

### Twitch.tv


### YouTube


### Kick.com


## Technical Details

### Architecture
- **Content Script**: Runs on Twitch pages, monitors chat activity
- **Background Script**: Manages extension lifecycle and settings
- **Popup Interface**: Provides user settings and configuration
- **Storage**: Uses Chrome storage API for persistent settings

### Permissions
- `activeTab`: Required for content script injection
- `storage`: For saving user preferences
- Host permission for `https://www.twitch.tv/*`: To inject content script

### Browser Compatibility
- Chrome 88+ (required for Manifest V3)
- Firefox, Edge, and other Chromium-based browsers

## Development

### Project Structure
```
├── manifest.json          # Extension manifest
├── content.js            # Main content script
├── background.js         # Service worker
├── popup.html           # Settings popup HTML
├── popup.js             # Settings popup JavaScript
├── styles.css           # Extension styles
├── icons/               # Extension icons
│   ├── icon16.svg
│   ├── icon32.svg
│   ├── icon48.svg
│   └── icon128.svg
└── README.md            # This file
```

### Building and Testing
1. Make changes to the source files
2. Reload the extension in `chrome://extensions/`
3. Test on various Twitch channel pages
4. Check console logs for debugging information

## Privacy & Security

- **No Data Collection**: The extension does not collect or transmit any user data
- **Local Processing**: All chat monitoring happens locally in the browser
- **Minimal Permissions**: Only requests necessary permissions for functionality
- **Secure Storage**: User settings stored securely using Chrome storage API







