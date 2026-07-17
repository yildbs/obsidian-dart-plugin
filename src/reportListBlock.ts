import { Notice } from 'obsidian';
import { buildReportUrl } from './formatters/reportLinkFormatter';
import {
	DartDisclosureReport,
	DartReportListBlockState,
	DartReportListPresetId,
	DartReportListSortKey,
} from './types';

interface RenderReportListBlockOptions {
	source: string;
	containerEl: HTMLElement;
	getBlock: (guid: string) => DartReportListBlockState | undefined;
	saveBlock: (block: DartReportListBlockState) => Promise<void>;
	refreshReports: (
		block: DartReportListBlockState,
	) => Promise<DartDisclosureReport[]>;
}

interface ReportPreset {
	id: DartReportListPresetId;
	label: string;
	matches: (report: DartDisclosureReport) => boolean;
}

const REPORT_PRESETS: ReportPreset[] = [
	{
		id: 'performance',
		label: '실적/손익',
		matches: (report) =>
			hasAny(report.reportName, [
				'잠정실적',
				'영업(잠정)실적',
				'영업잠정실적',
				'매출액또는손익구조',
				'매출액 또는 손익구조',
				'손익구조',
				'매출액',
				'영업이익',
				'영업실적',
				'결산실적',
				'사업보고서',
				'반기보고서',
				'분기보고서',
			]),
	},
	{
		id: 'periodic',
		label: '정기공시',
		matches: (report) =>
			hasAny(report.reportName, ['사업보고서', '반기보고서', '분기보고서']),
	},
	{
		id: 'material',
		label: '주요사항',
		matches: (report) => hasAny(report.reportName, ['주요사항보고서']),
	},
	{
		id: 'ownership',
		label: '지분/내부자',
		matches: (report) =>
			hasAny(report.reportName, [
				'주식등의대량보유',
				'임원ㆍ주요주주',
				'임원 주요주주',
				'최대주주',
				'공개매수',
				'소유주식변동',
			]),
	},
	{
		id: 'issuance',
		label: '발행/자금조달',
		matches: (report) =>
			hasAny(report.reportName, [
				'증권신고',
				'소액공모',
				'유상증자',
				'무상증자',
				'전환사채',
				'신주인수권',
				'교환사채',
				'사채권',
			]),
	},
	{
		id: 'shareholderReturn',
		label: '배당/자사주',
		matches: (report) =>
			hasAny(report.reportName, [
				'배당',
				'자기주식',
				'신탁계약',
				'주주환원',
			]),
	},
	{
		id: 'governance',
		label: '주총/지배구조',
		matches: (report) =>
			hasAny(report.reportName, [
				'주주총회',
				'의결권대리행사',
				'사외이사',
				'이사회의사록',
				'기업지배구조',
			]),
	},
	{
		id: 'marketAction',
		label: '시장조치',
		matches: (report) =>
			hasAny(report.reportName, [
				'수시공시',
				'공정공시',
				'거래정지',
				'시장조치',
				'불성실공시',
				'관리종목',
				'상장폐지',
			]),
	},
	{
		id: 'audit',
		label: '감사/회계',
		matches: (report) =>
			hasAny(report.reportName, [
				'감사보고서',
				'연결감사보고서',
				'감사전재무제표',
				'회계',
			]),
	},
	{
		id: 'other',
		label: '기타',
		matches: (report) =>
			REPORT_PRESETS.filter((preset) => preset.id !== 'other').every(
				(preset) => !preset.matches(report),
			),
	},
];

const SORT_LABELS: Record<DartReportListSortKey, string> = {
	receiptDate: '접수일',
	reportName: '보고서명',
	filerName: '제출인',
};

const REPORT_PRESET_IDS = REPORT_PRESETS.map((preset) => preset.id);

export async function renderReportListBlock(
	options: RenderReportListBlockOptions,
): Promise<void> {
	const guid = parseGuid(options.source);
	options.containerEl.empty();
	options.containerEl.addClass('dart-report-list');

	if (guid === null) {
		options.containerEl.createDiv({
			cls: 'dart-report-list-empty',
			text: 'guid가 없는 DART 보고서 리스트입니다.',
		});
		return;
	}

	const block = options.getBlock(guid);
	if (block === undefined) {
		options.containerEl.createDiv({
			cls: 'dart-report-list-empty',
			text: '저장된 DART 보고서 리스트 상태를 찾을 수 없습니다.',
		});
		return;
	}

	normalizeBlockViewState(block);
	renderBlock(options, block);
}

function renderBlock(
	options: RenderReportListBlockOptions,
	block: DartReportListBlockState,
): void {
	const { containerEl } = options;
	containerEl.empty();
	containerEl.addClass('dart-report-list');

	containerEl.createEl('h4', { text: `${block.corpName} DART 보고서` });
	renderSummary(options, block);
	renderControls(options, block);
	renderPresetFilters(options, block);
	renderTable(options, block);
}

function normalizeBlockViewState(block: DartReportListBlockState): void {
	const enabled = new Set(block.view.enabledPresetIds);
	const allLegacyPresetsEnabled = REPORT_PRESET_IDS.filter(
		(id) => id !== 'performance',
	).every((id) => enabled.has(id));
	if (!enabled.has('performance') && allLegacyPresetsEnabled) {
		enabled.add('performance');
	}

	block.view.enabledPresetIds = REPORT_PRESET_IDS.filter((id) => enabled.has(id));
}

function renderSummary(
	options: RenderReportListBlockOptions,
	block: DartReportListBlockState,
): void {
	const summaryEl = options.containerEl.createDiv({
		cls: 'dart-report-list-summary',
	});
	summaryEl.createDiv({
		text: `종목코드: ${block.stockCode === '' ? '-' : block.stockCode}`,
	});
	summaryEl.createDiv({
		text: `조회 기간: ${block.startDate} ~ ${block.endDate}`,
	});
	summaryEl.createDiv({
		text: `마지막 갱신: ${
			block.updatedAt === null ? '-' : formatDateTime(block.updatedAt)
		}`,
	});
}

function renderControls(
	options: RenderReportListBlockOptions,
	block: DartReportListBlockState,
): void {
	const controlsEl = options.containerEl.createDiv({
		cls: 'dart-report-list-controls',
	});

	const startInput = controlsEl.createEl('input', { type: 'date' });
	startInput.value = block.startDate;
	startInput.addEventListener('change', () => {
		block.startDate = clampStartDate(startInput.value, block.endDate);
		void options.saveBlock(block);
	});

	const endInput = controlsEl.createEl('input', { type: 'date' });
	endInput.value = block.endDate;
	endInput.addEventListener('change', () => {
		block.endDate = endInput.value;
		block.startDate = clampStartDate(block.startDate, block.endDate);
		void options.saveBlock(block);
	});

	const searchInput = controlsEl.createEl('input', {
		type: 'search',
		placeholder: '보고서 검색',
	});
	searchInput.value = block.view.searchText;
	searchInput.addEventListener('input', () => {
		block.view.searchText = searchInput.value;
		void saveAndRender(options, block);
	});

	const refreshButton = controlsEl.createEl('button', { text: 'Refresh' });
	refreshButton.addEventListener('click', () => {
		void refreshBlock(options, block, refreshButton);
	});
}

async function refreshBlock(
	options: RenderReportListBlockOptions,
	block: DartReportListBlockState,
	refreshButton: HTMLButtonElement,
): Promise<void> {
		refreshButton.disabled = true;
		refreshButton.textContent = '갱신 중';
		try {
			block.reports = await options.refreshReports(block);
			block.updatedAt = new Date().toISOString();
			await options.saveBlock(block);
			renderBlock(options, block);
			new Notice('Dart 보고서 리스트를 갱신했습니다.');
		} catch (error) {
			console.error('DART report list refresh failed', error);
			new Notice(getErrorMessage(error));
			refreshButton.disabled = false;
			refreshButton.textContent = 'Refresh';
		}
}

function renderPresetFilters(
	options: RenderReportListBlockOptions,
	block: DartReportListBlockState,
): void {
	const filterEl = options.containerEl.createDiv({
		cls: 'dart-report-list-filters',
	});

	for (const preset of REPORT_PRESETS) {
		const labelEl = filterEl.createEl('label', {
			cls: 'dart-report-list-filter',
		});
		const checkbox = labelEl.createEl('input', { type: 'checkbox' });
		checkbox.checked = block.view.enabledPresetIds.includes(preset.id);
		checkbox.addEventListener('change', () => {
			const enabled = new Set(block.view.enabledPresetIds);
			if (checkbox.checked) {
				enabled.add(preset.id);
			} else {
				enabled.delete(preset.id);
			}
			block.view.enabledPresetIds = REPORT_PRESETS.map((item) => item.id).filter(
				(id) => enabled.has(id),
			);
			void saveAndRender(options, block);
		});
		labelEl.createSpan({ text: preset.label });
	}

	const correctionLabel = filterEl.createEl('label', {
		cls: 'dart-report-list-filter',
	});
	const correctionCheckbox = correctionLabel.createEl('input', {
		type: 'checkbox',
	});
	correctionCheckbox.checked = block.view.includeCorrections;
	correctionCheckbox.addEventListener('change', () => {
		block.view.includeCorrections = correctionCheckbox.checked;
		void saveAndRender(options, block);
	});
	correctionLabel.createSpan({ text: '정정공시 포함' });
}

function renderTable(
	options: RenderReportListBlockOptions,
	block: DartReportListBlockState,
): void {
	const reports = getVisibleReports(block);
	const countEl = options.containerEl.createDiv({
		cls: 'dart-report-list-count',
		text: `${reports.length.toLocaleString('ko-KR')} / ${block.reports.length.toLocaleString('ko-KR')}건`,
	});

	if (reports.length === 0) {
		countEl.createDiv({
			cls: 'dart-report-list-empty',
			text: '표시할 보고서가 없습니다.',
		});
		return;
	}

	const tableEl = options.containerEl.createEl('table', {
		cls: 'dart-report-list-table',
	});
	const theadEl = tableEl.createEl('thead');
	const headerRowEl = theadEl.createEl('tr');
	renderSortableHeader(options, block, headerRowEl, 'receiptDate');
	renderSortableHeader(options, block, headerRowEl, 'reportName');
	renderSortableHeader(options, block, headerRowEl, 'filerName');
	headerRowEl.createEl('th', { text: '링크' });

	const tbodyEl = tableEl.createEl('tbody');
	for (const report of reports) {
		const rowEl = tbodyEl.createEl('tr');
		rowEl.createEl('td', {
			cls: 'dart-report-list-nowrap',
			text: formatReceiptDate(report.receiptDate),
		});
		const reportNameEl = rowEl.createEl('td');
		reportNameEl.createEl('a', {
			text: report.reportName,
			href: buildReportUrl(report.receiptNo),
			attr: {
				target: '_blank',
				rel: 'noopener',
			},
		});
		rowEl.createEl('td', { text: report.filerName });
		rowEl
			.createEl('td', { cls: 'dart-report-list-nowrap' })
			.createEl('a', {
				text: '열기',
				href: buildReportUrl(report.receiptNo),
				attr: {
					target: '_blank',
					rel: 'noopener',
				},
			});
	}
}

function renderSortableHeader(
	options: RenderReportListBlockOptions,
	block: DartReportListBlockState,
	rowEl: HTMLTableRowElement,
	sortKey: DartReportListSortKey,
): void {
	const thEl = rowEl.createEl('th');
	const button = thEl.createEl('button', {
		cls: 'dart-report-list-sort-button',
		text: getSortLabel(block, sortKey),
	});
	button.addEventListener('click', () => {
		if (block.view.sortKey === sortKey) {
			block.view.sortDirection =
				block.view.sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			block.view.sortKey = sortKey;
			block.view.sortDirection = sortKey === 'receiptDate' ? 'desc' : 'asc';
		}
		void saveAndRender(options, block);
	});
}

function getVisibleReports(
	block: DartReportListBlockState,
): DartDisclosureReport[] {
	const query = normalizeSearchText(block.view.searchText);
	const enabled = new Set(block.view.enabledPresetIds);
	const reports = block.reports.filter((report) => {
		if (!block.view.includeCorrections && isCorrectionReport(report)) {
			return false;
		}
		if (!REPORT_PRESETS.some((preset) => enabled.has(preset.id) && preset.matches(report))) {
			return false;
		}
		if (query === '') {
			return true;
		}

		return normalizeSearchText(
			`${report.reportName} ${report.filerName} ${report.receiptDate}`,
		).includes(query);
	});

	return reports.sort((a, b) => compareReports(a, b, block));
}

function compareReports(
	a: DartDisclosureReport,
	b: DartDisclosureReport,
	block: DartReportListBlockState,
): number {
	const direction = block.view.sortDirection === 'asc' ? 1 : -1;
	const key = block.view.sortKey;
	const result = getSortValue(a, key).localeCompare(
		getSortValue(b, key),
		'ko',
		{ numeric: true },
	);
	if (result !== 0) {
		return result * direction;
	}
	return b.receiptNo.localeCompare(a.receiptNo);
}

function getSortValue(
	report: DartDisclosureReport,
	sortKey: DartReportListSortKey,
): string {
	if (sortKey === 'receiptDate') {
		return report.receiptDate;
	}
	if (sortKey === 'reportName') {
		return report.reportName;
	}
	return report.filerName;
}

async function saveAndRender(
	options: RenderReportListBlockOptions,
	block: DartReportListBlockState,
): Promise<void> {
	await options.saveBlock(block);
	renderBlock(options, block);
}

function parseGuid(source: string): string | null {
	const match = source.match(/^\s*guid\s*:\s*(.+?)\s*$/m);
	return match?.[1]?.trim() || null;
}

function getSortLabel(
	block: DartReportListBlockState,
	sortKey: DartReportListSortKey,
): string {
	if (block.view.sortKey !== sortKey) {
		return SORT_LABELS[sortKey];
	}
	return `${SORT_LABELS[sortKey]} ${block.view.sortDirection === 'asc' ? '▲' : '▼'}`;
}

function hasAny(value: string, needles: string[]): boolean {
	const normalized = normalizeSearchText(value);
	return needles.some((needle) => normalized.includes(normalizeSearchText(needle)));
}

function normalizeSearchText(value: string): string {
	return value.replaceAll(/\s/g, '').toLowerCase();
}

function isCorrectionReport(report: DartDisclosureReport): boolean {
	return report.reportName.includes('정정');
}

function clampStartDate(startDate: string, endDate: string): string {
	if (startDate === '' || endDate === '') {
		return startDate;
	}
	return startDate > endDate ? endDate : startDate;
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

function formatReceiptDate(receiptDate: string): string {
	if (/^\d{8}$/.test(receiptDate)) {
		return `${receiptDate.slice(0, 4)}.${receiptDate.slice(4, 6)}.${receiptDate.slice(6, 8)}`;
	}
	return receiptDate;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message !== '') {
		return error.message;
	}
	return 'DART 보고서 리스트를 갱신할 수 없습니다.';
}
