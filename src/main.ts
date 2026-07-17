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
import { renderReportListBlock } from './reportListBlock';
import {
	DartPluginSettings,
	DartSettingTab,
	DEFAULT_REPORT_LIST_VIEW_STATE,
	DEFAULT_SETTINGS,
} from './settings';
import {
	DartCompany,
	DartDisclosureMeta,
	DartReportListBlockState,
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

		this.registerMarkdownCodeBlockProcessor(
			'dart-report-list',
			(source, el) => {
				void renderReportListBlock({
					source,
					containerEl: el,
					getBlock: (guid) => this.settings.reportListBlocks[guid],
					saveBlock: async (block) => {
						this.settings.reportListBlocks[block.guid] = block;
						await this.saveSettings();
					},
					refreshReports: async (block) =>
						await this.dartClient.searchCompanyDisclosures(
							this.settings.apiKey,
							block.corpCode,
							block.startDate,
							block.endDate,
						),
					fetchUploadTimes: async (block, reports) =>
						await this.dartClient.fetchRecentDisclosureTimes(
							block.corpCode,
							reports.map((report) => report.receiptDate),
						),
				});
			},
		);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DartPluginSettings>,
		);
		this.settings.reportListBlocks = this.settings.reportListBlocks ?? {};
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
			onInsertReportList: () => {
				void this.insertReportListBlock();
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

	private async insertReportListBlock(): Promise<void> {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (markdownView === null || markdownView.file === null) {
			new Notice('보고서 리스트를 삽입할 노트를 열어야 합니다.');
			return;
		}
		if (this.settings.apiKey === '') {
			new Notice('Dart API key를 먼저 설정해야 합니다.');
			return;
		}

		try {
			const company = await this.resolveReportListCompany(markdownView.file);
			if (company === null) {
				return;
			}

			const endDate = formatDateInput(new Date());
			const startDate = shiftDateByMonths(endDate, -6);
			const reports = await this.dartClient.searchCompanyDisclosures(
				this.settings.apiKey,
				company.corpCode,
				startDate,
				endDate,
			);
			const guid = createGuid();
			const block: DartReportListBlockState = {
				guid,
				corpCode: company.corpCode,
				corpName: company.corpName,
				stockCode: company.stockCode,
				startDate,
				endDate,
				updatedAt: new Date().toISOString(),
				reports,
				view: {
					...DEFAULT_REPORT_LIST_VIEW_STATE,
					enabledPresetIds: [...DEFAULT_REPORT_LIST_VIEW_STATE.enabledPresetIds],
				},
			};

			this.settings.reportListBlocks[guid] = block;
			await this.saveSettings();

			markdownView.editor.replaceSelection(
				'```dart-report-list\n' + `guid: ${guid}\n` + '```\n',
			);
			new Notice('Dart 보고서 리스트를 삽입했습니다.');
		} catch (error) {
			console.error('DART report list insert failed', error);
			new Notice(getErrorMessage(error));
		}
	}

	private async resolveReportListCompany(
		file: NonNullable<MarkdownView['file']>,
	): Promise<DartCompany | null> {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const symbol = getFrontmatterString(frontmatter, 'symbol');
		const assetName = getFrontmatterString(frontmatter, 'asset_name');

		if (symbol === '' && assetName === '') {
			new Notice('Frontmatter의 symbol 또는 asset_name을 찾을 수 없습니다.');
			return null;
		}

		const cache = await this.getOrCreateCompanyCache();
		const normalizedSymbol = normalizeStockCode(symbol);
		if (normalizedSymbol !== '') {
			const company = cache.companies.find(
				(candidate) => candidate.stockCode === normalizedSymbol,
			);
			if (company !== undefined) {
				return company;
			}
		}

		const candidates = findCompaniesByName(cache.companies, assetName);
		if (candidates.length === 0) {
			new Notice('Frontmatter의 기업 정보를 dart 기업 리스트에서 찾을 수 없습니다.');
			return null;
		}
		if (candidates.length > 1) {
			new Notice('기업 후보가 여러 개입니다. Symbol 값을 확인해 주세요.');
			return null;
		}

		return candidates[0] ?? null;
	}

	private async getOrCreateCompanyCache() {
		const cache = await this.corpCodeStore.load();
		if (cache !== null) {
			return cache;
		}

		new Notice('기업 리스트 캐시를 생성하고 있습니다.');
		const companies = await this.dartClient.downloadCompanies(this.settings.apiKey);
		return await this.corpCodeStore.save(companies);
	}
}

function getFrontmatterString(
	frontmatter: Record<string, unknown> | undefined,
	key: string,
): string {
	const value = frontmatter?.[key];
	return typeof value === 'string' || typeof value === 'number'
		? String(value).trim()
		: '';
}

function normalizeStockCode(value: string): string {
	const digits = value.replaceAll(/[^0-9]/g, '');
	return digits === '' ? '' : digits.padStart(6, '0');
}

function createGuid(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shiftDateByMonths(value: string, months: number): string {
	const date = parseDateInput(value) ?? new Date();
	date.setMonth(date.getMonth() + months);
	return formatDateInput(date);
}

function parseDateInput(value: string): Date | null {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (match === null) {
		return null;
	}

	const year = Number.parseInt(match[1] ?? '', 10);
	const month = Number.parseInt(match[2] ?? '', 10);
	const day = Number.parseInt(match[3] ?? '', 10);
	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
		return null;
	}

	return new Date(year, month - 1, day);
}

function formatDateInput(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
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
