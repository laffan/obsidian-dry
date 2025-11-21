# D.R.Y. - Don't Repeat Yourself

An Obsidian plugin that helps you identify and highlight repeated words within your writing to improve clarity and conciseness.

## Features

- **Smart Repeat Detection**: Automatically detects repeated words within configurable ranges
- **Color-Coded Highlights**: Each pair of repeated words is highlighted in a unique color for easy identification
- **Flexible Range Options**: Check for repeats in:
  - Current paragraph only
  - Current + previous paragraph
  - Full document
- **Customizable Stopwords**: Manage a list of common words to ignore (articles, prepositions, etc.)
- **Quick Toggle**: Keyboard shortcut and command palette options to turn highlighting on/off
- **Non-Intrusive**: Only applies visual highlights; doesn't modify your actual content

## Installation

### Manual Installation

1. Download the latest release from the Releases page
2. Extract the files to your vault's `.obsidian/plugins/obsidian-dry/` folder
3. Reload Obsidian
4. Enable the plugin in **Settings → Community plugins**

### From Community Plugins (coming soon)

Search for "D.R.Y." in Obsidian's community plugins browser.

## Usage

### Basic Usage

1. Enable the plugin in settings
2. Open any note in editing or reading view
3. The plugin will automatically highlight repeated words based on your configured range
4. Each pair of repeated words will be shown in a different color

### Toggling the Highlight

- **Keyboard shortcut**: Press the configured hotkey (default: can be set in Settings)
- **Command palette**: Open command palette (Cmd/Ctrl+P) and search for "Toggle D.R.Y. highlighting"

### Configuration

Access plugin settings via **Settings → D.R.Y.**

#### Detection Range

Choose where to look for repeated words:
- **Current paragraph**: Only checks the active paragraph
- **Two paragraphs**: Checks current and previous paragraph
- **Full document**: Scans the entire document

You can also change this via the command palette with "D.R.Y.: Set range to..."

#### Stopwords Management

Stopwords are common words that are intentionally ignored by the repeat detector (e.g., "the", "a", "an", "in", "on").

- **Search**: Filter the stopwords list to find specific words
- **Add**: Add new words to ignore
- **Remove**: Click the X next to any word to remove it from the list
- **Reset**: Restore the default stopwords list

## How It Works

The plugin analyzes your text in real-time, identifying words that appear multiple times within the configured range. It intelligently:
- Ignores case differences (e.g., "The" and "the" are considered the same)
- Skips stopwords to reduce noise
- Assigns unique colors to each repeated word pair for easy visual identification
- Updates highlights as you type

## Privacy

This plugin operates entirely locally within Obsidian. No data is sent to external servers.

## Support

If you encounter any issues or have feature requests, please file them on the [GitHub Issues page](https://github.com/laffan/obsidian-dry/issues).

## Development

See [AGENTS.md](./AGENTS.md) for development guidelines and setup instructions.

## License

MIT License - see LICENSE file for details.
