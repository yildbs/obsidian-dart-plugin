import { MarkdownView, Notice, Plugin } from 'obsidian';
import { DartClient } from './dartClient';
import { DartExtractModal } from './dartModal';
import {
	buildIncomeStatementTable,
	getFsDivisionForExtractType,
} from './extractors/incomeStatementExtractor';
import {
	buildIncomeStatementMarkdown,
	mergeMarkdownSections,
} from './formatters/markdownTableBuilder';
import {
	DartPluginSettings,
	DartSettingTab,
	DEFAULT_SETTINGS,
} from './settings';
import { DartExtractRequest, ExtractType } from './types';

const EXTRACT_TITLES: Record<ExtractType, string> = {
	consolidated_comprehensive_income: '연결포괄손익계산서',
	separate_comprehensive_income: '포괄손익계산서',
};

const EMPTY_MESSAGES: Record<ExtractType, string> = {
	consolidated_comprehensive_income:
		'연결포괄손익계산서 데이터를 찾을 수 없습니다.',
	separate_comprehensive_income: '포괄손익계산서 데이터를 찾을 수 없습니다.',
};

export default class DartPlugin extends Plugin {
	settings!: DartPluginSettings;
	private readonly dartClient = new DartClient();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addRibbonIcon('file-spreadsheet', 'Dart 데이터 추출', () => {
			this.openExtractModal();
		});

		this.addCommand({
			id: 'open-dart-extract-modal',
			name: 'Dart 데이터 추출',
			callback: () => {
				this.openExtractModal();
			},
		});

		this.addSettingTab(new DartSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DartPluginSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private openExtractModal(): void {
		new DartExtractModal(this.app, {
			apiKey: this.settings.apiKey,
			defaultUnit: this.settings.defaultUnit,
			onSubmit: async (request) => {
				await this.runExtract(request);
			},
		}).open();
	}

	private async runExtract(request: DartExtractRequest): Promise<void> {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (markdownView === null) {
			new Notice('테이블을 삽입할 노트를 열어야 합니다.');
			return;
		}

		this.settings.apiKey = request.apiKey;
		this.settings.defaultUnit = request.unit;
		await this.saveSettings();

		new Notice('Dart 데이터를 조회하고 있습니다.');

		try {
			const meta = await this.dartClient.findDisclosureMeta(
				request.apiKey,
				request.rcpNo,
			);

			const sections: string[] = [];
			for (const extractType of request.extractTypes) {
				const fsDivision = getFsDivisionForExtractType(extractType);
				const items = await this.dartClient.getFinancialStatementItems(
					request.apiKey,
					meta,
					fsDivision,
				);
				const table = buildIncomeStatementTable(
					EXTRACT_TITLES[extractType],
					meta,
					items,
					request.unit,
				);

				if (table === null) {
					sections.push(buildEmptySection(extractType));
				} else {
					sections.push(buildIncomeStatementMarkdown(table));
				}
			}

			markdownView.editor.replaceSelection(mergeMarkdownSections(sections));
			new Notice('Dart 테이블을 삽입했습니다.');
		} catch (error) {
			console.error('DART extract failed', error);
			new Notice(getErrorMessage(error));
		}
	}
}

function buildEmptySection(extractType: ExtractType): string {
	return [`### ${EXTRACT_TITLES[extractType]}`, '', EMPTY_MESSAGES[extractType]].join(
		'\n',
	);
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message !== '') {
		return error.message;
	}
	return 'DART 데이터를 조회할 수 없습니다.';
}
