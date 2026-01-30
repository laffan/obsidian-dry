import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting, editorLivePreviewField } from 'obsidian';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

type DetectionRange = 'paragraph' | 'two-paragraphs' | 'document';

interface DRYPluginSettings {
	enabled: boolean;
	range: DetectionRange;
	stopwords: string[];
	ignoreProperNouns: boolean;
	includeBaseWords: boolean;
}

const DEFAULT_STOPWORDS = [
	// Articles
	'a', 'an', 'the',
	// Prepositions
	'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by', 'about', 'as',
	'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
	'under', 'over', 'against', 'among', 'upon', 'without', 'within',
	// Conjunctions
	'and', 'or', 'but', 'nor', 'yet', 'so', 'if', 'because', 'while', 'although',
	'though', 'unless', 'until', 'when', 'where', 'whether',
	// Pronouns
	'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
	'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours',
	'theirs', 'this', 'that', 'these', 'those', 'who', 'whom', 'whose', 'which',
	'what', 'whoever', 'whatever', 'whichever',
	// Common verbs
	'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
	'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
	'must', 'can', 'shall',
	// Other common words
	'not', 'no', 'yes', 'all', 'any', 'some', 'more', 'most', 'much', 'many',
	'such', 'very', 'too', 'also', 'just', 'only', 'even', 'still', 'again',
	'here', 'there', 'now', 'then', 'than', 'how', 'why', 'well', 'up', 'down',
	'out', 'off', 'own', 'same', 'other', 'another', 'each', 'every', 'both',
	'few', 'several', 'either', 'neither'
];

const DEFAULT_SETTINGS: DRYPluginSettings = {
	enabled: true,
	range: 'paragraph',
	stopwords: DEFAULT_STOPWORDS,
	ignoreProperNouns: false,
	includeBaseWords: false
};

interface WordPosition {
	word: string;
	stem: string;
	from: number;
	to: number;
}

interface TokenPosition {
	word: string;
	stem: string;
	from: number;
	to: number;
	isStopword: boolean;
}

export default class DRYPlugin extends Plugin {
	settings: DRYPluginSettings;
	private updateDebounceTimer: number | null = null;

	async onload() {
		await this.loadSettings();

		// Collapse frontmatter when switching documents or opening files
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.collapseFrontmatter();
			})
		);

		// Also collapse frontmatter when layout is ready (initial load)
		this.app.workspace.onLayoutReady(() => {
			this.collapseFrontmatter();
		});

		// Register the editor extension
		this.registerEditorExtension([
			ViewPlugin.fromClass(class {
				decorations: DecorationSet;
				plugin: DRYPlugin;

				constructor(view: EditorView) {
					this.plugin = (view.state.field(editorLivePreviewField) as any)?.plugin ||
					             (window as any).dryPlugin;
					this.decorations = this.buildDecorations(view);
				}

				update(update: ViewUpdate) {
					if (update.docChanged || update.viewportChanged || update.selectionSet) {
						this.decorations = this.buildDecorations(update.view);
					}
				}

				buildDecorations(view: EditorView): DecorationSet {
					const plugin = (window as any).dryPlugin;
					if (!plugin || !plugin.settings.enabled) {
						return Decoration.none;
					}

					const builder = new RangeSetBuilder<Decoration>();
					const doc = view.state.doc.toString();
					const repeats = plugin.findRepeatedWords(doc, view);

					// Group repeats by word (or stem if includeBaseWords is enabled)
					const wordGroups = new Map<string, WordPosition[]>();
					for (const pos of repeats) {
						const key = plugin.settings.includeBaseWords ? pos.stem : pos.word.toLowerCase();
						if (!wordGroups.has(key)) {
							wordGroups.set(key, []);
						}
						wordGroups.get(key)!.push(pos);
					}

					// Assign colors to word groups and collect all decorations
					const decorationsToAdd: Array<{ from: number; to: number; decoration: Decoration }> = [];
					let colorIndex = 0;
					for (const [word, positions] of wordGroups) {
						if (positions.length > 1) {
							const className = `dry-repeat-${(colorIndex % 10) + 1}`;
							for (const pos of positions) {
								decorationsToAdd.push({
									from: pos.from,
									to: pos.to,
									decoration: Decoration.mark({ class: className })
								});
							}
							colorIndex++;
						}
					}

					// Sort decorations by position before adding to builder
					decorationsToAdd.sort((a, b) => a.from - b.from);

					// Add decorations in sorted order
					for (const dec of decorationsToAdd) {
						builder.add(dec.from, dec.to, dec.decoration);
					}

					return builder.finish();
				}
			}, {
				decorations: v => v.decorations
			})
		]);

		// Store plugin instance globally for access from editor extension
		(window as any).dryPlugin = this;

		// Add toggle command
		this.addCommand({
			id: 'toggle-dry',
			name: 'Toggle D.R.Y. highlighting',
			callback: () => {
				this.settings.enabled = !this.settings.enabled;
				this.saveSettings();
				this.refresh();
			}
		});

		// Add range commands
		this.addCommand({
			id: 'set-range-paragraph',
			name: 'Set range: Current paragraph',
			callback: () => {
				this.settings.range = 'paragraph';
				this.saveSettings();
				this.refresh();
			}
		});

		this.addCommand({
			id: 'set-range-two-paragraphs',
			name: 'Set range: Two paragraphs',
			callback: () => {
				this.settings.range = 'two-paragraphs';
				this.saveSettings();
				this.refresh();
			}
		});

		this.addCommand({
			id: 'set-range-document',
			name: 'Set range: Full document',
			callback: () => {
				this.settings.range = 'document';
				this.saveSettings();
				this.refresh();
			}
		});

		// Add settings tab
		this.addSettingTab(new DRYSettingTab(this.app, this));
	}

	onunload() {
		// Clean up global reference
		delete (window as any).dryPlugin;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	refresh() {
		// Force all markdown editors to update their decorations
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView && leaf.view.editor) {
				const view = leaf.view;
				// Trigger a state update by re-setting the selection
				// This forces CodeMirror to rebuild decorations via selectionSet flag
				const cm = (view.editor as any).cm;
				if (cm && cm.dispatch && cm.state) {
					const currentSelection = cm.state.selection;
					cm.dispatch({ selection: currentSelection });
				}
			}
		});
	}

	collapseFrontmatter() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			const metadataEditor = (activeView as any).metadataEditor;
			if (metadataEditor && typeof metadataEditor.setCollapse === 'function') {
				metadataEditor.setCollapse(true);
			}
		}
	}

	findRepeatedWords(doc: string, view: EditorView): WordPosition[] {
		const cursorPos = view.state.selection.main.head;
		let textToAnalyze = '';
		let startOffset = 0;

		if (this.settings.range === 'paragraph') {
			// Find current paragraph
			const { text, offset } = this.getCurrentParagraph(doc, cursorPos);
			textToAnalyze = text;
			startOffset = offset;
		} else if (this.settings.range === 'two-paragraphs') {
			// Find current and previous paragraph
			const { text, offset } = this.getCurrentAndPreviousParagraph(doc, cursorPos);
			textToAnalyze = text;
			startOffset = offset;
		} else {
			// Full document
			textToAnalyze = doc;
			startOffset = 0;
		}

		return this.extractRepeatedWords(textToAnalyze, startOffset);
	}

	getCurrentParagraph(doc: string, cursorPos: number): { text: string; offset: number } {
		// Find paragraph boundaries (double newline or start/end of doc)
		let start = cursorPos;
		let end = cursorPos;

		// Search backwards for paragraph start
		while (start > 0 && doc[start - 1] !== '\n') {
			start--;
		}
		// If we found a newline, check if there's another one before it
		if (start > 0 && doc[start - 1] === '\n') {
			while (start > 0 && doc[start - 1] === '\n') {
				start--;
			}
			if (start < doc.length) start++;
		}

		// Search forwards for paragraph end
		while (end < doc.length && doc[end] !== '\n') {
			end++;
		}
		// Skip any trailing newlines
		while (end < doc.length && doc[end] === '\n') {
			end++;
		}

		return {
			text: doc.substring(start, end),
			offset: start
		};
	}

	getCurrentAndPreviousParagraph(doc: string, cursorPos: number): { text: string; offset: number } {
		// Get current paragraph
		const current = this.getCurrentParagraph(doc, cursorPos);

		// Find previous paragraph
		if (current.offset === 0) {
			return current; // No previous paragraph
		}

		let prevStart = current.offset - 1;
		while (prevStart > 0 && doc[prevStart] === '\n') {
			prevStart--;
		}

		const previous = this.getCurrentParagraph(doc, prevStart);

		return {
			text: doc.substring(previous.offset, current.offset + current.text.length),
			offset: previous.offset
		};
	}

	extractRepeatedWords(text: string, offset: number): WordPosition[] {
		// Extract all tokens including stopwords for phrase detection
		const allTokens = this.extractAllTokens(text, offset);

		// Find repeated phrases (sequences that repeat)
		return this.findRepeatedPhrases(allTokens, text, offset);
	}

	extractAllTokens(text: string, offset: number): TokenPosition[] {
		const tokens: TokenPosition[] = [];
		const wordPattern = /\b[\w'-]+\b/g;
		let match;

		while ((match = wordPattern.exec(text)) !== null) {
			const word = match[0];
			const wordLower = word.toLowerCase();

			// Skip numbers
			if (/^\d+$/.test(word)) {
				continue;
			}

			// Skip proper nouns if setting is enabled
			if (this.settings.ignoreProperNouns && this.isProperNoun(word, match.index, text)) {
				continue;
			}

			const isStopword = this.settings.stopwords.includes(wordLower);

			tokens.push({
				word: wordLower,
				stem: this.stemWord(wordLower),
				from: offset + match.index,
				to: offset + match.index + word.length,
				isStopword
			});
		}

		return tokens;
	}

	findRepeatedPhrases(tokens: TokenPosition[], text: string, offset: number): WordPosition[] {
		if (tokens.length === 0) return [];

		// Build a map of token sequences to their positions
		// Key format: "stem1|stem2|stem3" or "word1|word2|word3" depending on includeBaseWords
		const getKey = (token: TokenPosition): string => {
			return this.settings.includeBaseWords ? token.stem : token.word;
		};

		// First, find all repeated individual non-stopword tokens
		const tokenOccurrences = new Map<string, number[]>(); // key -> array of token indices
		for (let i = 0; i < tokens.length; i++) {
			if (!tokens[i].isStopword) {
				const key = getKey(tokens[i]);
				if (!tokenOccurrences.has(key)) {
					tokenOccurrences.set(key, []);
				}
				tokenOccurrences.get(key)!.push(i);
			}
		}

		// Track which token indices are covered by a phrase
		const coveredByPhrase = new Set<number>();
		const results: WordPosition[] = [];

		// For each repeated token, try to extend it into a phrase
		// Process tokens in order to handle overlaps consistently
		for (let i = 0; i < tokens.length; i++) {
			if (tokens[i].isStopword) continue;
			if (coveredByPhrase.has(i)) continue;

			const key = getKey(tokens[i]);
			const occurrences = tokenOccurrences.get(key);
			if (!occurrences || occurrences.length < 2) continue;

			// Try to find the longest phrase starting at this position that repeats
			let bestPhraseLength = 1; // At minimum, the single word repeats
			let bestPhraseMatches: number[] = occurrences.filter(idx => idx !== i);

			// Try extending the phrase
			for (let phraseLen = 2; phraseLen <= tokens.length - i; phraseLen++) {
				// Build the phrase key for tokens[i..i+phraseLen-1]
				const phraseKeys: string[] = [];
				for (let j = 0; j < phraseLen; j++) {
					phraseKeys.push(getKey(tokens[i + j]));
				}
				const phraseKey = phraseKeys.join('|');

				// Find other occurrences of this exact phrase
				const phraseMatches: number[] = [];
				for (const startIdx of occurrences) {
					if (startIdx === i) continue;
					if (startIdx + phraseLen > tokens.length) continue;

					// Check if the phrase matches
					let matches = true;
					for (let j = 0; j < phraseLen; j++) {
						if (getKey(tokens[startIdx + j]) !== phraseKeys[j]) {
							matches = false;
							break;
						}
					}

					if (matches) {
						phraseMatches.push(startIdx);
					}
				}

				if (phraseMatches.length > 0) {
					bestPhraseLength = phraseLen;
					bestPhraseMatches = phraseMatches;
				} else {
					// No matches for this length, stop extending
					break;
				}
			}

			// Now we have the best phrase starting at position i
			// Add all occurrences of this phrase (including position i)
			const allOccurrences = [i, ...bestPhraseMatches];

			// Check if this phrase contains at least one non-stopword (it does, since we started from one)
			// Create WordPosition entries for each occurrence
			for (const startIdx of allOccurrences) {
				// Mark all tokens in this phrase as covered
				for (let j = 0; j < bestPhraseLength; j++) {
					coveredByPhrase.add(startIdx + j);
				}

				// Create a single WordPosition spanning the entire phrase
				const startToken = tokens[startIdx];
				const endToken = tokens[startIdx + bestPhraseLength - 1];

				// Build the phrase word and stem for grouping
				const phraseWords: string[] = [];
				const phraseStems: string[] = [];
				for (let j = 0; j < bestPhraseLength; j++) {
					phraseWords.push(tokens[startIdx + j].word);
					phraseStems.push(tokens[startIdx + j].stem);
				}

				results.push({
					word: phraseWords.join('|'),
					stem: phraseStems.join('|'),
					from: startToken.from,
					to: endToken.to
				});
			}
		}

		return results;
	}

	stemWord(word: string): string {
		// Simple English stemming algorithm
		// Removes common suffixes to find base word forms

		// Don't stem very short words
		if (word.length <= 3) {
			return word;
		}

		// Remove common suffixes (order matters - check longer suffixes first)
		const suffixes = [
			// Plural and verb forms
			{ suffix: 'ies', replacement: 'y', minLength: 4 },     // parties -> party
			{ suffix: 'ied', replacement: 'y', minLength: 4 },     // carried -> carry
			{ suffix: 'ying', replacement: 'y', minLength: 5 },    // carrying -> carry
			{ suffix: 'sses', replacement: 'ss', minLength: 5 },   // passes -> pass
			{ suffix: 'xes', replacement: 'x', minLength: 4 },     // fixes -> fix
			{ suffix: 'zes', replacement: 'ze', minLength: 4 },    // freezes -> freeze
			{ suffix: 'ches', replacement: 'ch', minLength: 5 },   // watches -> watch
			{ suffix: 'shes', replacement: 'sh', minLength: 5 },   // wishes -> wish
			{ suffix: 'ing', replacement: '', minLength: 4 },      // running -> run, providing -> provid
			{ suffix: 'ed', replacement: '', minLength: 3 },       // provided -> provid
			{ suffix: 'es', replacement: '', minLength: 3 },       // provides -> provid
			{ suffix: 's', replacement: '', minLength: 2 },        // runs -> run

			// Other common suffixes
			{ suffix: 'ment', replacement: '', minLength: 5 },     // movement -> move
			{ suffix: 'ness', replacement: '', minLength: 5 },     // happiness -> happi
			{ suffix: 'tion', replacement: '', minLength: 5 },     // creation -> creat
			{ suffix: 'ation', replacement: '', minLength: 6 },    // creation -> creat
			{ suffix: 'er', replacement: '', minLength: 3 },       // faster -> fast
			{ suffix: 'est', replacement: '', minLength: 4 },      // fastest -> fast
			{ suffix: 'ly', replacement: '', minLength: 4 },       // quickly -> quick
		];

		for (const { suffix, replacement, minLength } of suffixes) {
			if (word.endsWith(suffix) && word.length >= minLength + suffix.length) {
				const stem = word.slice(0, -suffix.length) + replacement;
				// Avoid returning stems that are too short
				if (stem.length >= 2) {
					return stem;
				}
			}
		}

		return word;
	}

	isProperNoun(word: string, position: number, text: string): boolean {
		// Check if the word is capitalized
		if (word[0] !== word[0].toUpperCase()) {
			return false;
		}

		// If it's at the very beginning of the text, it's not a proper noun (sentence start)
		if (position === 0) {
			return false;
		}

		// Check if it's at the start of a sentence
		// Look backwards from the word position to find non-whitespace characters
		let i = position - 1;

		// Skip whitespace
		while (i >= 0 && /\s/.test(text[i])) {
			i--;
		}

		// If we're at the start of text, it's a sentence start
		if (i < 0) {
			return false;
		}

		// Check if the previous non-whitespace character is sentence-ending punctuation
		const prevChar = text[i];
		if (prevChar === '.' || prevChar === '!' || prevChar === '?') {
			return false; // It's at the start of a sentence
		}

		// Check for special case: after a newline (paragraph start)
		if (prevChar === '\n') {
			return false;
		}

		// It's capitalized and not at sentence start, so it's likely a proper noun
		return true;
	}
}

class DRYSettingTab extends PluginSettingTab {
	plugin: DRYPlugin;
	private stopwordSearchQuery = '';

	constructor(app: App, plugin: DRYPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'D.R.Y. Settings' });

		// Detection range setting
		new Setting(containerEl)
			.setName('Detection range')
			.setDesc('Choose where to look for repeated words')
			.addDropdown(dropdown => dropdown
				.addOption('paragraph', 'Current paragraph')
				.addOption('two-paragraphs', 'Two paragraphs (current + previous)')
				.addOption('document', 'Full document')
				.setValue(this.plugin.settings.range)
				.onChange(async (value) => {
					this.plugin.settings.range = value as DetectionRange;
					await this.plugin.saveSettings();
					this.plugin.refresh();
				}));

		// Ignore proper nouns setting
		new Setting(containerEl)
			.setName('Ignore proper nouns')
			.setDesc('Skip capitalized words that appear mid-sentence (likely proper nouns like names and places)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.ignoreProperNouns)
				.onChange(async (value) => {
					this.plugin.settings.ignoreProperNouns = value;
					await this.plugin.saveSettings();
					this.plugin.refresh();
				}));

		// Include base words setting
		new Setting(containerEl)
			.setName('Include base word repeats')
			.setDesc('Match words with shared base forms (e.g., "provide" and "providing", "share" and "shared")')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeBaseWords)
				.onChange(async (value) => {
					this.plugin.settings.includeBaseWords = value;
					await this.plugin.saveSettings();
					this.plugin.refresh();
				}));

		// Stopwords section
		containerEl.createEl('h3', { text: 'Stopwords' });
		containerEl.createEl('p', {
			text: 'Common words to ignore when detecting repeats. These words will not be highlighted even if repeated.',
			cls: 'setting-item-description'
		});

		// Search box
		const searchSetting = new Setting(containerEl)
			.setName('Search stopwords')
			.addText(text => text
				.setPlaceholder('Type to search...')
				.setValue(this.stopwordSearchQuery)
				.onChange(value => {
					this.stopwordSearchQuery = value;
					this.displayStopwordsList();
				}));

		// Add new stopword
		const addSetting = new Setting(containerEl)
			.setName('Add stopword')
			.setDesc('Add a new word to the stopwords list')
			.addText(text => {
				text.setPlaceholder('Enter word');
				return text;
			})
			.addButton(button => button
				.setButtonText('Add')
				.setCta()
				.onClick(async () => {
					const input = addSetting.controlEl.querySelector('input');
					if (input) {
						const word = input.value.trim().toLowerCase();
						if (word && !this.plugin.settings.stopwords.includes(word)) {
							this.plugin.settings.stopwords.push(word);
							this.plugin.settings.stopwords.sort();
							await this.plugin.saveSettings();
							input.value = '';
							this.displayStopwordsList();
							this.plugin.refresh();
						}
					}
				}));

		// Reset button
		new Setting(containerEl)
			.setName('Reset stopwords')
			.setDesc('Restore the default stopwords list')
			.addButton(button => button
				.setButtonText('Reset to defaults')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.stopwords = [...DEFAULT_STOPWORDS];
					await this.plugin.saveSettings();
					this.stopwordSearchQuery = '';
					this.display();
					this.plugin.refresh();
				}));

		// Stopwords list container
		const listContainer = containerEl.createDiv('dry-stopwords-list');
		this.displayStopwordsList();
	}

	displayStopwordsList(): void {
		const container = this.containerEl.querySelector('.dry-stopwords-list');
		if (!container) return;

		container.empty();

		const filteredWords = this.plugin.settings.stopwords
			.filter(word => word.includes(this.stopwordSearchQuery.toLowerCase()))
			.sort();

		if (filteredWords.length === 0) {
			container.createEl('p', {
				text: this.stopwordSearchQuery
					? 'No stopwords match your search.'
					: 'No stopwords configured.',
				cls: 'dry-empty-state'
			});
			return;
		}

		const listEl = container.createDiv('dry-stopwords-grid');

		for (const word of filteredWords) {
			const wordItem = listEl.createDiv('dry-stopword-item');
			wordItem.createSpan({ text: word });

			const removeBtn = wordItem.createEl('button', {
				text: '×',
				cls: 'dry-stopword-remove'
			});
			removeBtn.addEventListener('click', async () => {
				this.plugin.settings.stopwords = this.plugin.settings.stopwords
					.filter(w => w !== word);
				await this.plugin.saveSettings();
				this.displayStopwordsList();
				this.plugin.refresh();
			});
		}

		container.createEl('p', {
			text: `${filteredWords.length} stopword${filteredWords.length !== 1 ? 's' : ''} ${
				this.stopwordSearchQuery ? 'found' : 'total'
			}`,
			cls: 'dry-stopwords-count'
		});
	}
}
