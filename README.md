# Google Default Account Switcher

A Chrome extension that helps you manage multiple Google accounts by automatically redirecting to your preferred default account across Google services.

## Features

- 🔄 Automatically redirect to your default Google account
- 📧 Seamless Gmail account switching
- 🌓 Dark/Light mode support
- 🔍 Auto-detection of signed-in Google accounts
- ⚡ Fast and lightweight
- 🛠️ Manual mode option for temporary disable

## Installation

1. Download the extension from the Chrome Web Store (coming soon)
2. Or install manually:
   - Clone this repository
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the extension directory

## Usage

1. Click the extension icon in your Chrome toolbar
2. Select your preferred default Google account from the dropdown
3. Click "Set as Default" to save your preference
4. The extension will now automatically redirect you to your chosen account

### Manual Mode

If you need to temporarily disable the automatic redirection:
1. Click the extension icon
2. Toggle "Disable Extension" switch
3. The extension will stop redirecting until you re-enable it

## How It Works

The extension uses Chrome's webNavigation API to detect when you're accessing Google services and automatically redirects you to your preferred account. It maintains a clean and simple interface while handling complex account management behind the scenes.

## Privacy & Security

- 🔒 No data collection
- 💾 All settings stored locally in your browser
- 🚫 No external services or analytics
- ✅ Only requested permissions are used

## Permissions Used

- `declarativeNetRequest`: For URL redirection
- `storage`: To save your preferences
- `webNavigation`: To detect Google service navigation
- `tabs`: For account detection and redirection
- `scripting`: For account detection

## Support

For bugs, feature requests, or questions:
- Create an issue on GitHub
- Contact: [Habeeb Rahman](https://bento.me/habeebrahman)

## Version History

- v1.0.0 (Beta)
  - Initial release with Gmail support
  - Account auto-detection
  - Dark/Light mode
  - Manual mode toggle

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use and modify as needed.

---

Created by [Habeeb Rahman](https://bento.me/habeebrahman)