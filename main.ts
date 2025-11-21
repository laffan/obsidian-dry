import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting, editorLivePreviewField } from 'obsidian';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

type DetectionRange = 'paragraph' | 'two-paragraphs' | 'document';

interface DRYPluginSettings {
	enabled: boolean;
	range: DetectionRange;
	stopwords: string[];
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
	stopwords: DEFAULT_STOPWORDS
};

interface WordPosition {
	word: string;
	from: number;
	to: number;
}

export default class DRYPlugin extends Plugin {
	settings: DRYPluginSettings;
	private updateDebounceTimer: number | null = null;

	async onload() {
		await this.loadSettings();

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
					if (update.docChanged || update.viewportChanged) {
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

					// Group repeats by word
					const wordGroups = new Map<string, WordPosition[]>();
					for (const pos of repeats) {
						const key = pos.word.toLowerCase();
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
		// Trigger editor refresh
		this.app.workspace.updateOptions();
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
		const words: WordPosition[] = [];
		const wordPattern = /\b[\w'-]+\b/g;
		let match;

		while ((match = wordPattern.exec(text)) !== null) {
			const word = match[0];
			const wordLower = word.toLowerCase();

			// Skip stopwords
			if (this.settings.stopwords.includes(wordLower)) {
				continue;
			}

			// Skip numbers
			if (/^\d+$/.test(word)) {
				continue;
			}

			words.push({
				word: wordLower,
				from: offset + match.index,
				to: offset + match.index + word.length
			});
		}

		return words;
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
