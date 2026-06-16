import { App, Modal, Notice, Setting } from 'obsidian';
import {
	AmountUnit,
	CorpCodeCache,
	DartCompany,
	DartReportSearchRequest,
	DartReportSearchResult,
} from './types';

interface ReportSearchModalOptions {
	apiKey: string;
	defaultUnit: AmountUnit;
	defaultStartDate: string;
	defaultEndDate: string;
	defaultIncludeUrl: boolean;
	defaultIncludeFinancialStatement: boolean;
	loadCompanyCache: () => Promise<CorpCodeCache | null>;
	refreshCompanyCache: (apiKey: string) => Promise<CorpCodeCache>;
	findCompanyCandidates: (companyName: string) => Promise<DartCompany[]>;
	onSearch: (
		apiKey: string,
		corpCode: string,
		startDate: string,
		endDate: string,
	) => Promise<DartReportSearchResult[]>;
	onInsert: (
		request: DartReportSearchRequest,
		reports: DartReportSearchResult[],
	) => Promise<void>;
}

export class ReportSearchModal extends Modal {
	private apiKey: string;
	private companyName = '';
	private startDate: string;
	private endDate: string;
	private includeUrl: boolean;
	private includeFinancialStatement: boolean;
	private unit: AmountUnit;
	private companyCacheUpdatedAt: string | null = null;
	private companyCandidates: DartCompany[] = [];
	private selectedCorpCode = '';
	private results: DartReportSearchResult[] = [];
	private selectedReceiptNos = new Set<string>();
	private isRefreshingCompanies = false;
	private isSearching = false;
	private isInserting = false;
	private readonly loadCompanyCache: ReportSearchModalOptions['loadCompanyCache'];
	private readonly refreshCompanyCache: ReportSearchModalOptions['refreshCompanyCache'];
	private readonly findCompanyCandidates: ReportSearchModalOptions['findCompanyCandidates'];
	private readonly onSearch: ReportSearchModalOptions['onSearch'];
	private readonly onInsert: ReportSearchModalOptions['onInsert'];

	constructor(app: App, options: ReportSearchModalOptions) {
		super(app);
		this.apiKey = options.apiKey;
		this.startDate = options.defaultStartDate;
		this.endDate = options.defaultEndDate;
		this.includeUrl = options.defaultIncludeUrl;
		this.includeFinancialStatement = options.defaultIncludeFinancialStatement;
		this.unit = options.defaultUnit;
		this.loadCompanyCache = options.loadCompanyCache;
		this.refreshCompanyCache = options.refreshCompanyCache;
		this.findCompanyCandidates = options.findCompanyCandidates;
		this.onSearch = options.onSearch;
		this.onInsert = options.onInsert;
	}

	onOpen(): void {
		this.render();
		void this.loadCacheStatus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dart-plugin-modal');
		contentEl.createEl('h2', { text: '보고서 검색' });

		this.renderSearchForm(contentEl);
		this.renderCompanyCandidates(contentEl);
		this.renderResultList(contentEl);
		this.renderInsertOptions(contentEl);
		this.renderActions(contentEl);
	}

	private renderSearchForm(contentEl: HTMLElement): void {
		new Setting(contentEl)
			.setName('API key')
			.setDesc('Dart open API key를 입력합니다.')
			.addText((text) => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('API key')
					.setValue(this.apiKey)
					.onChange((value) => {
						this.apiKey = value.trim();
					});
			});

		new Setting(contentEl)
			.setName('기업명')
			.setDesc('공시검색 결과의 기업명으로 필터링합니다.')
			.addText((text) => {
				text
					.setPlaceholder('삼양식품')
					.setValue(this.companyName)
					.onChange((value) => {
						this.companyName = value.trim();
						this.companyCandidates = [];
						this.selectedCorpCode = '';
						this.results = [];
						this.selectedReceiptNos.clear();
					});
			});

		new Setting(contentEl)
			.setName('검색 시작일')
			.setDesc('예: 2023-01-01')
			.addText((text) => {
				text.inputEl.type = 'date';
				text.setValue(this.startDate).onChange((value) => {
					this.startDate = clampStartDate(value, this.endDate);
				});
			})
			.addButton((button) => {
				button.setButtonText('1년 전').onClick(() => {
					this.startDate = clampStartDate(
						shiftDateByYears(this.startDate || this.endDate || getToday(), -1),
						this.endDate,
					);
					this.render();
				});
			})
			.addButton((button) => {
				button.setButtonText('1년 후').onClick(() => {
					this.startDate = clampStartDate(
						shiftDateByYears(this.startDate || this.endDate || getToday(), 1),
						this.endDate,
					);
					this.render();
				});
			});

		new Setting(contentEl)
			.setName('검색 종료일')
			.setDesc('예: 2023-12-31')
			.addText((text) => {
				text.inputEl.type = 'date';
				text.setValue(this.endDate).onChange((value) => {
					this.endDate = value;
					this.startDate = clampStartDate(this.startDate, this.endDate);
				});
			})
			.addButton((button) => {
				button.setButtonText('오늘').onClick(() => {
					this.endDate = getToday();
					this.startDate = clampStartDate(this.startDate, this.endDate);
					this.render();
				});
			});

		new Setting(contentEl)
			.setName('기업 리스트')
			.setDesc(this.getCompanyCacheDescription())
			.addButton((button) => {
				button
					.setButtonText(
						this.isRefreshingCompanies ? '갱신 중' : '기업 리스트 갱신',
					)
					.onClick(async () => {
						await this.refreshCompanies();
					});
			})
			.addButton((button) => {
				button
					.setButtonText(this.isSearching ? '검색 중' : '검색')
					.setCta()
					.onClick(async () => {
						await this.search();
					});
			});
	}

	private renderCompanyCandidates(contentEl: HTMLElement): void {
		if (this.companyCandidates.length === 0) {
			return;
		}

		new Setting(contentEl).setName('기업 후보').setHeading();
		const candidateListEl = contentEl.createDiv({
			cls: 'dart-plugin-candidate-list',
		});

		for (const company of this.companyCandidates) {
			const rowEl = candidateListEl.createEl('label', {
				cls: 'dart-plugin-candidate-row',
			});
			const radio = rowEl.createEl('input', { type: 'radio' });
			radio.name = 'dart-company-candidate';
			radio.checked = this.selectedCorpCode === company.corpCode;
			radio.addEventListener('change', () => {
				this.selectedCorpCode = company.corpCode;
				this.results = [];
				this.selectedReceiptNos.clear();
			});
			rowEl.createDiv({
				cls: 'dart-plugin-candidate-company',
				text: company.corpName,
			});
			rowEl.createDiv({
				cls: 'dart-plugin-candidate-stock',
				text: company.stockCode === '' ? '-' : company.stockCode,
			});
			rowEl.createDiv({
				cls: 'dart-plugin-candidate-code',
				text: company.corpCode,
			});
		}
	}

	private renderInsertOptions(contentEl: HTMLElement): void {
		new Setting(contentEl).setName('삽입 옵션').setHeading();

		const optionContainer = contentEl.createDiv({
			cls: 'dart-plugin-checkboxes',
		});
		this.renderOptionCheckbox(optionContainer, 'URL', this.includeUrl, (checked) => {
			this.includeUrl = checked;
		});
		this.renderOptionCheckbox(
			optionContainer,
			'재무제표',
			this.includeFinancialStatement,
			(checked) => {
				this.includeFinancialStatement = checked;
			},
		);

		new Setting(contentEl)
			.setName('금액 단위')
			.setDesc('재무제표를 삽입할 때 사용할 단위입니다.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('억', '억원')
					.addOption('조', '조원')
					.setValue(this.unit)
					.onChange((value) => {
						this.unit = value as AmountUnit;
					});
			});
	}

	private renderResultList(contentEl: HTMLElement): void {
		new Setting(contentEl).setName('검색 결과').setHeading();

		const toolbar = contentEl.createDiv({ cls: 'dart-plugin-result-toolbar' });
		const selectAllButton = toolbar.createEl('button', { text: '전체 선택' });
		selectAllButton.addEventListener('click', () => {
			this.selectedReceiptNos = new Set(
				this.results.map((report) => report.receiptNo),
			);
			this.render();
		});

		const clearButton = toolbar.createEl('button', { text: '전체 해제' });
		clearButton.addEventListener('click', () => {
			this.selectedReceiptNos.clear();
			this.render();
		});

		if (this.results.length === 0) {
			contentEl.createDiv({
				cls: 'dart-plugin-empty',
				text: '검색 결과가 없습니다.',
			});
			return;
		}

		const listEl = contentEl.createDiv({ cls: 'dart-plugin-result-list' });
		for (const report of this.results) {
			const rowEl = listEl.createEl('label', {
				cls: 'dart-plugin-report-row',
			});
			const checkbox = rowEl.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.selectedReceiptNos.has(report.receiptNo);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedReceiptNos.add(report.receiptNo);
				} else {
					this.selectedReceiptNos.delete(report.receiptNo);
				}
			});

			rowEl.createDiv({
				cls: 'dart-plugin-report-date',
				text: formatDate(report.receiptDate),
			});
			rowEl.createDiv({
				cls: 'dart-plugin-report-company',
				text: report.corpName,
			});
			rowEl.createDiv({
				cls: 'dart-plugin-report-name',
				text: toReportKindLabel(report.reportKind),
			});
		}
	}

	private renderActions(contentEl: HTMLElement): void {
		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText(this.isInserting ? '삽입 중' : '삽입')
					.setCta()
					.onClick(async () => {
						await this.insert();
					});
			})
			.addButton((button) => {
				button.setButtonText('취소').onClick(() => {
					this.close();
				});
			});
	}

	private renderOptionCheckbox(
		containerEl: HTMLElement,
		label: string,
		checked: boolean,
		onChange: (checked: boolean) => void,
	): void {
		const labelEl = containerEl.createEl('label', {
			cls: 'dart-plugin-checkbox-row',
		});
		const checkbox = labelEl.createEl('input', { type: 'checkbox' });
		checkbox.checked = checked;
		checkbox.addEventListener('change', () => {
			onChange(checkbox.checked);
		});
		labelEl.createDiv({
			cls: 'dart-plugin-checkbox-label',
			text: label,
		});
	}

	private async loadCacheStatus(): Promise<void> {
		try {
			const cache = await this.loadCompanyCache();
			this.companyCacheUpdatedAt = cache?.updatedAt ?? null;
			this.render();
		} catch (error) {
			console.error('DART company cache load failed', error);
		}
	}

	private async refreshCompanies(): Promise<void> {
		if (this.isRefreshingCompanies) {
			return;
		}
		if (this.apiKey === '') {
			new Notice('Dart API key를 입력해야 합니다.');
			return;
		}

		this.isRefreshingCompanies = true;
		this.render();
		try {
			const cache = await this.refreshCompanyCache(this.apiKey);
			this.companyCacheUpdatedAt = cache.updatedAt;
			this.companyCandidates = [];
			this.selectedCorpCode = '';
			this.results = [];
			this.selectedReceiptNos.clear();
			new Notice('기업 리스트를 갱신했습니다.');
		} catch (error) {
			console.error('DART company cache refresh failed', error);
			new Notice(getErrorMessage(error));
		} finally {
			this.isRefreshingCompanies = false;
			this.render();
		}
	}

	private async search(): Promise<void> {
		if (this.isSearching) {
			return;
		}
		if (this.apiKey === '') {
			new Notice('Dart API key를 입력해야 합니다.');
			return;
		}
		if (this.companyName === '') {
			new Notice('기업명을 입력해야 합니다.');
			return;
		}
		if (this.startDate === '' || this.endDate === '') {
			new Notice('검색 시작일과 종료일을 입력해야 합니다.');
			return;
		}
		if (this.startDate > this.endDate) {
			new Notice('검색 시작일은 종료일보다 늦을 수 없습니다.');
			return;
		}

		this.isSearching = true;
		this.render();
		try {
			await this.prepareCompanySelection();
			if (this.selectedCorpCode === '') {
				return;
			}

			this.results = await this.onSearch(
				this.apiKey,
				this.selectedCorpCode,
				this.startDate,
				this.endDate,
			);
			this.selectedReceiptNos.clear();
			if (this.results.length === 0) {
				new Notice('검색 결과가 없습니다.');
			}
		} catch (error) {
			console.error('DART report search failed', error);
			new Notice(getErrorMessage(error));
		} finally {
			this.isSearching = false;
			this.render();
		}
	}

	private async insert(): Promise<void> {
		if (this.isInserting) {
			return;
		}
		if (!this.includeUrl && !this.includeFinancialStatement) {
			new Notice('삽입할 항목을 하나 이상 선택해야 합니다.');
			return;
		}

		const selectedReports = this.results.filter((report) =>
			this.selectedReceiptNos.has(report.receiptNo),
		);
		if (selectedReports.length === 0) {
			new Notice('삽입할 보고서를 하나 이상 선택해야 합니다.');
			return;
		}

		this.isInserting = true;
		this.render();
		try {
			await this.onInsert(
				{
					apiKey: this.apiKey,
					companyName: this.companyName,
					corpCode: selectedReports[0]?.corpCode ?? this.selectedCorpCode,
					startDate: this.startDate,
					endDate: this.endDate,
					includeUrl: this.includeUrl,
					includeFinancialStatement: this.includeFinancialStatement,
					unit: this.unit,
				},
				selectedReports,
			);
			this.close();
		} catch (error) {
			console.error('DART report insert failed', error);
			new Notice(getErrorMessage(error));
		} finally {
			this.isInserting = false;
		}
	}

	private async prepareCompanySelection(): Promise<void> {
		if (
			this.selectedCorpCode !== '' &&
			this.companyCandidates.some(
				(company) => company.corpCode === this.selectedCorpCode,
			)
		) {
			return;
		}

		const candidates = await this.findCompanyCandidates(this.companyName);
		if (candidates.length === 0) {
			this.companyCandidates = [];
			this.selectedCorpCode = '';
			this.results = [];
			this.selectedReceiptNos.clear();
			new Notice('기업 후보를 찾을 수 없습니다. 기업 리스트를 갱신했는지 확인하세요.');
			return;
		}

		this.companyCandidates = candidates;
		this.results = [];
		this.selectedReceiptNos.clear();

		if (candidates.length === 1) {
			this.selectedCorpCode = candidates[0]?.corpCode ?? '';
			return;
		}

		this.selectedCorpCode = '';
		new Notice('기업 후보를 선택한 뒤 다시 검색하세요.');
	}

	private getCompanyCacheDescription(): string {
		if (this.companyCacheUpdatedAt === null) {
			return '기업 리스트를 갱신한 뒤 검색할 수 있습니다.';
		}
		return `${formatDateTime(this.companyCacheUpdatedAt)} 갱신됨`;
	}
}

function formatDate(value: string): string {
	if (/^\d{8}$/.test(value)) {
		return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
	}
	return value;
}

function toReportKindLabel(reportKind: DartReportSearchResult['reportKind']): string {
	if (reportKind === 'annual') {
		return '사업보고서';
	}
	if (reportKind === 'half') {
		return '반기보고서';
	}
	return '분기보고서';
}

function clampStartDate(startDate: string, endDate: string): string {
	if (startDate === '' || endDate === '') {
		return startDate;
	}
	return startDate > endDate ? endDate : startDate;
}

function shiftDateByYears(value: string, years: number): string {
	const date = parseDateInput(value);
	if (date === null) {
		return value;
	}

	date.setFullYear(date.getFullYear() + years);
	return formatDateInput(date);
}

function getToday(): string {
	return formatDateInput(new Date());
}

function formatDateTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}

	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day} ${hours}:${minutes}`;
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

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message !== '') {
		return error.message;
	}
	return 'DART 데이터를 조회할 수 없습니다.';
}
