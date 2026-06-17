import { MarkdownView, Notice, Plugin } from 'obsidian';
import { CorpCodeStore, findCompaniesByName } from './corpCodeStore';
import { DartClient } from './dartClient';
import { DartExtractModal } from './dartModal';
import {
	buildIncomeStatementTable,
	getFsDivisionForExtractType,
} from './extractors/incomeStatementExtractor';
import { FeatureSelectModal } from './featureSelectModal';
import {
	buildIncomeStatementMarkdown,
	mergeMarkdownSections,
} from './formatters/markdownTableBuilder';
import { buildReportMarkdownLink } from './formatters/reportLinkFormatter';
import { ReportSearchModal } from './reportSearchModal';
import {
	DartPluginSettings,
	DartSettingTab,
	DEFAULT_SETTINGS,
} from './settings';
import {
	DartDisclosureMeta,
	DartExtractRequest,
	DartReportSearchRequest,
	DartReportSearchResult,
	ExtractType,
} from './types';

const EXTRACT_TITLES: Record<ExtractType, string> = {
	consolidated_comprehensive_income: '연결포괄손익계산서',
	separate_comprehensive_income: '포괄손익계산서',
};

export default class DartPlugin extends Plugin {
	settings!: DartPluginSettings;
	private readonly dartClient = new DartClient();
	private corpCodeStore!: CorpCodeStore;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.corpCodeStore = new CorpCodeStore(
			this.app.vault,
			this.manifest.dir ?? this.manifest.id,
		);

		this.addRibbonIcon('table', 'Dart', () => {
			this.openFeatureSelectModal();
		});

		this.addCommand({
			id: 'open-dart-feature-select',
			name: 'Dart 기능 선택',
			callback: () => {
				this.openFeatureSelectModal();
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

	private openFeatureSelectModal(): void {
		new FeatureSelectModal(this.app, {
			onOpenReportSearch: () => {
				this.openReportSearchModal();
			},
			onOpenFinancialExtract: () => {
				this.openExtractModal();
			},
		}).open();
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

	private openReportSearchModal(): void {
		new ReportSearchModal(this.app, {
			apiKey: this.settings.apiKey,
			defaultUnit: this.settings.defaultUnit,
			defaultStartDate: this.settings.reportSearchStartDate,
			defaultEndDate: this.settings.reportSearchEndDate,
			defaultIncludeUrl: this.settings.reportSearchIncludeUrl,
			defaultIncludeFinancialStatement:
				this.settings.reportSearchIncludeFinancialStatement,
			loadCompanyCache: async () => await this.corpCodeStore.load(),
			refreshCompanyCache: async (apiKey) => {
				this.settings.apiKey = apiKey;
				await this.saveSettings();
				const companies = await this.dartClient.downloadCompanies(apiKey);
				return await this.corpCodeStore.save(companies);
			},
			findCompanyCandidates: async (companyName) => {
				const cache = await this.corpCodeStore.load();
				if (cache === null) {
					return [];
				}
				return findCompaniesByName(cache.companies, companyName);
			},
			onSearch: async (apiKey, corpCode, startDate, endDate) => {
				this.settings.apiKey = apiKey;
				this.settings.reportSearchStartDate = startDate;
				this.settings.reportSearchEndDate = endDate;
				await this.saveSettings();
				return await this.dartClient.searchPeriodicReports(
					apiKey,
					corpCode,
					startDate,
					endDate,
				);
			},
			onInsert: async (request, reports) => {
				await this.runReportInsert(request, reports);
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
					sections.push('');
				} else {
					sections.push(buildIncomeStatementMarkdown(table));
				}
			}

			const markdown = mergeMarkdownSections(sections);
			if (markdown === '') {
				new Notice('포괄손익계산서 데이터를 찾을 수 없습니다.');
				return;
			}

			markdownView.editor.replaceSelection(markdown);
			new Notice('Dart 테이블을 삽입했습니다.');
		} catch (error) {
			console.error('DART extract failed', error);
			new Notice(getErrorMessage(error));
		}
	}

	private async runReportInsert(
		request: DartReportSearchRequest,
		reports: DartReportSearchResult[],
	): Promise<void> {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (markdownView === null) {
			new Notice('테이블을 삽입할 노트를 열어야 합니다.');
			return;
		}

		this.settings.apiKey = request.apiKey;
		this.settings.defaultUnit = request.unit;
		this.settings.reportSearchStartDate = request.startDate;
		this.settings.reportSearchEndDate = request.endDate;
		this.settings.reportSearchIncludeUrl = request.includeUrl;
		this.settings.reportSearchIncludeFinancialStatement =
			request.includeFinancialStatement;
		await this.saveSettings();

		new Notice('Dart 보고서를 삽입하고 있습니다.');

		const sections: string[] = [];
		const orderedReports = [...reports].sort((a, b) =>
			a.receiptDate.localeCompare(b.receiptDate),
		);

		for (const report of orderedReports) {
			const reportParts: string[] = [];
			if (request.includeUrl) {
				reportParts.push(buildReportMarkdownLink(report));
			}
			if (request.includeFinancialStatement) {
				const tableMarkdown = await this.buildReportFinancialStatementMarkdown(
					request,
					report,
				);
				if (tableMarkdown !== '') {
					reportParts.push(tableMarkdown);
				}
			}
			if (reportParts.length > 0) {
				sections.push(reportParts.join('\n\n'));
			}
		}

		const markdown = mergeMarkdownSections(sections);
		if (markdown === '') {
			new Notice('삽입할 보고서 내용이 없습니다.');
			return;
		}

		markdownView.editor.replaceSelection(markdown);
		new Notice('Dart 보고서를 삽입했습니다.');
	}

	private async buildReportFinancialStatementMarkdown(
		request: DartReportSearchRequest,
		report: DartReportSearchResult,
	): Promise<string> {
		const meta = toDisclosureMeta(report);
		const consolidatedItems = await this.dartClient.getFinancialStatementItems(
			request.apiKey,
			meta,
			'CFS',
		);
		const consolidatedTable = buildIncomeStatementTable(
			EXTRACT_TITLES.consolidated_comprehensive_income,
			meta,
			consolidatedItems,
			request.unit,
		);
		if (consolidatedTable !== null) {
			return buildIncomeStatementMarkdown(consolidatedTable);
		}

		const separateItems = await this.dartClient.getFinancialStatementItems(
			request.apiKey,
			meta,
			'OFS',
		);
		const separateTable = buildIncomeStatementTable(
			EXTRACT_TITLES.separate_comprehensive_income,
			meta,
			separateItems,
			request.unit,
		);

		return separateTable === null ? '' : buildIncomeStatementMarkdown(separateTable);
	}
}

function toDisclosureMeta(report: DartReportSearchResult): DartDisclosureMeta {
	return {
		corpCode: report.corpCode,
		corpName: report.corpName,
		reportName: report.reportName,
		receiptNo: report.receiptNo,
		receiptDate: report.receiptDate,
		businessYear: report.businessYear,
		reportCode: report.reportCode,
		reportKind: report.reportKind,
	};
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message !== '') {
		return error.message;
	}
	return 'DART 데이터를 조회할 수 없습니다.';
}
