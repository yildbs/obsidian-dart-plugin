import {
	AmountUnit,
	DartDisclosureMeta,
	DartFinancialStatementItem,
	FsDivision,
	IncomeStatementTable,
	ReportKind,
	StatementDivision,
} from '../types';

interface AccountMatcher {
	getLabel: (meta: DartDisclosureMeta) => string;
	accountIds: string[];
	names: string[];
	matchesName: (normalizedAccountName: string) => boolean;
}

const ACCOUNT_MATCHERS: AccountMatcher[] = [
	{
		getLabel: () => '매출',
		accountIds: [
			'ifrs-full_Revenue',
			'ifrs-full_RevenueFromContractsWithCustomers',
			'ifrs-full_SalesRevenue',
		],
		names: ['매출액', '수익', '영업수익', '매출'],
		matchesName: (accountName) =>
			accountName === '매출' ||
			accountName.includes('매출액') ||
			accountName.includes('수익') ||
			accountName.includes('영업수익'),
	},
	{
		getLabel: () => '영업이익',
		accountIds: ['dart_OperatingIncomeLoss', 'ifrs-full_ProfitLossFromOperatingActivities'],
		names: ['영업이익', '영업이익(손실)'],
		matchesName: (accountName) => accountName.includes('영업이익'),
	},
	{
		getLabel: getNetIncomeLabel,
		accountIds: ['ifrs-full_ProfitLoss'],
		names: [
			'당기순이익',
			'당기순이익(손실)',
			'반기순이익',
			'반기순이익(손실)',
			'분기순이익',
			'분기순이익(손실)',
		],
		matchesName: (accountName) =>
			accountName.includes('당기순이익') ||
			accountName.includes('반기순이익') ||
			accountName.includes('분기순이익'),
	},
];

const REPORT_QUARTER_LABELS: Record<Exclude<ReportKind, 'annual'>, string> = {
	q1: '1Q',
	half: '2Q',
	q3: '3Q',
};

export function buildIncomeStatementTable(
	title: string,
	meta: DartDisclosureMeta,
	items: DartFinancialStatementItem[],
	unit: AmountUnit,
): IncomeStatementTable | null {
	const columns = buildColumns(meta);
	const rows = ACCOUNT_MATCHERS.map((matcher) => {
		const cisItem = findStatementItem(items, 'CIS', matcher);
		const isItem = findStatementItem(items, 'IS', matcher);
		const values = Object.fromEntries(
			columns.map((column) => [
				column,
				getFallbackAmountForColumn(cisItem, isItem, meta, column),
			]),
		);
		const sourceStatement = getSourceStatement(cisItem, isItem, values, meta);

		return {
			label: matcher.getLabel(meta),
			values,
			sourceStatement,
		};
	});

	if (rows.every((row) => Object.values(row.values).every((value) => value === null))) {
		return null;
	}

	const sourceStatements = new Set(rows.map((row) => row.sourceStatement));
	const sourceStatement =
		sourceStatements.size > 1 ? 'CIS+IS' : rows[0]?.sourceStatement ?? 'CIS';

	return {
		title,
		unit,
		columns,
		rows: rows.map(({ label, values }) => ({ label, values })),
		sourceStatement,
	};
}

export function getFsDivisionForExtractType(
	extractType: string,
): FsDivision {
	return extractType === 'consolidated_comprehensive_income' ? 'CFS' : 'OFS';
}

function buildColumns(meta: DartDisclosureMeta): string[] {
	const year = Number.parseInt(meta.businessYear, 10);
	if (meta.reportKind === 'annual') {
		return [`${year}년`, `${year - 1}년`, `${year - 2}년`];
	}

	const quarter = REPORT_QUARTER_LABELS[meta.reportKind];
	return [
		`${year} ${quarter}`,
		`${year} ${quarter} 누적`,
		`${year - 1} ${quarter}`,
		`${year - 1} ${quarter} 누적`,
	];
}

function getNetIncomeLabel(meta: DartDisclosureMeta): string {
	if (meta.reportKind === 'annual') {
		return '당기순이익';
	}
	if (meta.reportKind === 'half') {
		return '반기순이익';
	}
	return '분기순이익';
}

function findStatementItem(
	items: DartFinancialStatementItem[],
	statementDivision: StatementDivision,
	matcher: AccountMatcher,
): DartFinancialStatementItem | undefined {
	const statementItems = items.filter((item) => item.sj_div === statementDivision);
	return (
		statementItems.find((item) => matcher.accountIds.includes(item.account_id ?? '')) ??
		statementItems.find((item) => {
			const accountName = normalizeAccountName(item.account_nm ?? '');
			return matcher.names.some(
				(name) => normalizeAccountName(name) === accountName,
			);
		}) ??
		statementItems.find((item) => matcher.matchesName(normalizeAccountName(item.account_nm ?? '')))
	);
}

function getAmountForColumn(
	item: DartFinancialStatementItem,
	meta: DartDisclosureMeta,
	column: string,
): number | null {
	const year = Number.parseInt(meta.businessYear, 10);
	if (meta.reportKind === 'annual') {
		if (column === `${year}년`) {
			return parseDartAmount(item.thstrm_amount);
		}
		if (column === `${year - 1}년`) {
			return parseDartAmount(item.frmtrm_amount);
		}
		if (column === `${year - 2}년`) {
			return parseDartAmount(item.bfefrmtrm_amount);
		}
		return null;
	}

	const quarter = REPORT_QUARTER_LABELS[meta.reportKind];
	if (column === `${year} ${quarter}`) {
		return parseDartAmount(item.thstrm_amount);
	}
	if (column === `${year} ${quarter} 누적`) {
		return parseDartAmount(item.thstrm_add_amount);
	}
	if (column === `${year - 1} ${quarter}`) {
		return parseDartAmount(item.frmtrm_q_amount);
	}
	if (column === `${year - 1} ${quarter} 누적`) {
		return parseDartAmount(item.frmtrm_add_amount);
	}

	return null;
}

function getFallbackAmountForColumn(
	cisItem: DartFinancialStatementItem | undefined,
	isItem: DartFinancialStatementItem | undefined,
	meta: DartDisclosureMeta,
	column: string,
): number | null {
	if (cisItem !== undefined) {
		const cisAmount = getAmountForColumn(cisItem, meta, column);
		if (cisAmount !== null) {
			return cisAmount;
		}
	}

	if (isItem !== undefined) {
		return getAmountForColumn(isItem, meta, column);
	}

	return null;
}

function getSourceStatement(
	cisItem: DartFinancialStatementItem | undefined,
	isItem: DartFinancialStatementItem | undefined,
	values: Record<string, number | null>,
	meta: DartDisclosureMeta,
): StatementDivision | 'CIS+IS' {
	if (cisItem === undefined && isItem !== undefined) {
		return 'IS';
	}
	if (cisItem === undefined || isItem === undefined) {
		return 'CIS';
	}

	const usedIs = Object.entries(values).some(([column, value]) => {
		if (value === null) {
			return false;
		}
		return getAmountForColumn(cisItem, meta, column) === null;
	});

	return usedIs ? 'CIS+IS' : 'CIS';
}

function parseDartAmount(value: string | undefined): number | null {
	if (value === undefined || value.trim() === '' || value.trim() === '-') {
		return null;
	}

	const normalized = value.replaceAll(',', '').replace(/\s/g, '');
	const parsed = Number.parseFloat(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAccountName(value: string): string {
	return value.replace(/\s/g, '').trim();
}
