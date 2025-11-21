# D.R.Y. Plugin Development Guide

## Project Overview

**D.R.Y. (Don't Repeat Yourself)** is an Obsidian plugin that helps writers identify repeated words within their documents. The plugin highlights repeated words with unique colors for each pair, making it easy to spot and fix redundancy.

- **Target**: Obsidian Community Plugin (TypeScript → bundled JavaScript)
- **Entry point**: `main.ts` compiled to `main.js` and loaded by Obsidian
- **Required artifacts**: `main.js`, `manifest.json`, `styles.css`

## Architecture

### Core Components

1. **Plugin Class** (`main.ts`)
   - Manages plugin lifecycle (load/unload)
   - Handles settings persistence
   - Registers commands and hotkeys
   - Coordinates between highlighter and settings

2. **Settings Interface**
   - Detection range (paragraph, two paragraphs, full document)
   - Stopwords list management
   - Toggle state (enabled/disabled)

3. **Word Detection Engine**
   - Parses text based on configured range
   - Identifies repeated words (case-insensitive)
   - Filters out stopwords
   - Returns word positions for highlighting

4. **Highlight Renderer**
   - Applies CSS classes to repeated words
   - Assigns unique colors to each word pair
   - Updates highlights dynamically
   - Cleans up highlights when toggled off

5. **Settings Tab**
   - Range selection dropdown
   - Stopwords search/add/remove interface
   - Reset to defaults button

## Environment & Tooling

- **Node.js**: Use current LTS (Node 18+ recommended)
- **Package manager**: npm (required - `package.json` defines scripts)
- **Bundler**: esbuild (required - `esbuild.config.mjs`)
- **Types**: `obsidian` type definitions

### Install Dependencies

```bash
npm install
```

### Development Mode (watch)

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

## File Structure

```
obsidian-dry/
├── main.ts              # Plugin entry point
├── manifest.json        # Plugin metadata
├── styles.css           # Highlight colors and styles
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
├── README.md            # User-facing documentation
└── AGENTS.md            # This file
```

## Key Features Implementation

### 1. Range Detection

The plugin supports three detection ranges:
- **paragraph**: Current paragraph only (text between two newlines)
- **two-paragraphs**: Current + previous paragraph
- **document**: Entire document content

### 2. Stopwords

Default stopwords list includes common English words:
- Articles: a, an, the
- Prepositions: in, on, at, to, for, of, with, from, by, about, as
- Conjunctions: and, or, but, nor, yet, so
- Pronouns: I, you, he, she, it, we, they, me, him, her, us, them
- Common verbs: is, are, was, were, be, been, being, have, has, had, do, does, did

### 3. Highlighting Strategy

- Use CSS classes like `dry-repeat-1`, `dry-repeat-2`, etc.
- Define color palette in `styles.css` with good contrast
- Limit to ~10 unique colors, then cycle
- Apply classes via editor decorations or DOM manipulation

### 4. Commands

Register these commands:
- `dry:toggle` - Toggle highlighting on/off
- `dry:set-range-paragraph` - Set range to current paragraph
- `dry:set-range-two` - Set range to two paragraphs
- `dry:set-range-document` - Set range to full document

## Testing

### Manual Testing

1. Copy `main.js`, `manifest.json`, `styles.css` to:
   ```
   <TestVault>/.obsidian/plugins/obsidian-dry/
   ```

2. Reload Obsidian and enable the plugin in **Settings → Community plugins**

3. Test scenarios:
   - Create a paragraph with repeated words
   - Toggle highlighting on/off
   - Change detection range
   - Add/remove stopwords
   - Test with multiple paragraphs
   - Verify colors are distinct and readable

## Coding Conventions

- TypeScript with `"strict": true`
- Use `async/await` over promise chains
- Handle errors gracefully with try-catch
- Clean up all event listeners in `onunload`
- Use `this.register*` helpers for cleanup
- Keep functions focused and well-named
- Comment complex logic

## Performance Considerations

- **Debounce text analysis**: Don't analyze on every keystroke
  - Use 300-500ms debounce for typing
- **Efficient text parsing**: Avoid regex when simple string operations suffice
- **Limit scope**: Only analyze visible content when possible
- **Cache results**: Store word positions to avoid re-parsing
- **Clean up**: Remove all decorations when toggled off

## Mobile Compatibility

- Plugin should work on mobile (set `isDesktopOnly: false`)
- Test on iOS/Android if possible
- Avoid desktop-only APIs
- Consider touch-friendly settings UI

## Privacy & Security

- All processing is local (no network calls)
- No telemetry or analytics
- No data collection
- Settings stored locally via Obsidian API

## Release Process

1. Update `version` in `manifest.json`
2. Update `versions.json` with plugin version → minimum Obsidian version
3. Run `npm run build` to generate production `main.js`
4. Create GitHub release with tag matching `manifest.json` version (no `v` prefix)
5. Attach `manifest.json`, `main.js`, `styles.css` to release

## Troubleshooting

- **Highlights not appearing**: Check console for errors, verify CSS is loaded
- **Performance issues**: Increase debounce time, reduce range
- **Stopwords not working**: Verify case-insensitive comparison
- **Colors not distinct**: Adjust CSS color palette in `styles.css`

## References

- [Obsidian API Documentation](https://docs.obsidian.md)
- [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Developer Policies](https://docs.obsidian.md/Developer+policies)
